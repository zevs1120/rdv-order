#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const baseUrl = process.env.RDV_BASE_URL || 'http://localhost:3002';
const outDir = process.argv[2] || 'docs/perf-assets';
const label = process.argv[3] || 'baseline';
const debugPort = Number(process.env.RDV_CDP_PORT || 9230);
const userDataDir = `/tmp/rdv-perf-${label}-${Date.now()}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 160)}`);
  }
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.eventListeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const waiter = this.pending.get(msg.id);
        if (!waiter) return;
        this.pending.delete(msg.id);
        if (msg.error) {
          waiter.reject(new Error(msg.error.message || 'CDP command failed'));
        } else {
          waiter.resolve(msg.result);
        }
        return;
      }
      if (!msg.method) return;
      const listeners = this.eventListeners.get(msg.method);
      if (!listeners) return;
      for (const fn of listeners) {
        fn(msg.params || {});
      }
    };
  }

  async connect() {
    await this.ready;
  }

  send(method, params = {}) {
    const id = ++this.id;
    const payload = JSON.stringify({ id, method, params });
    this.ws.send(payload);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  on(method, handler) {
    const prev = this.eventListeners.get(method) || [];
    this.eventListeners.set(method, [...prev, handler]);
    return () => {
      const next = (this.eventListeners.get(method) || []).filter((fn) => fn !== handler);
      this.eventListeners.set(method, next);
    };
  }

  waitForEvent(method, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      let timer = null;
      const off = this.on(method, (params) => {
        if (timer) clearTimeout(timer);
        off();
        resolve(params);
      });
      timer = setTimeout(() => {
        off();
        reject(new Error(`Timeout waiting for event ${method}`));
      }, timeoutMs);
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || 'Runtime.evaluate failed');
    }
    return res.result.value;
  }

  close() {
    this.ws.close();
  }
}

function summarizeTrace(trace) {
  const events = Array.isArray(trace?.traceEvents) ? trace.traceEvents : [];
  const summary = {
    eventCount: events.length,
    layoutMs: 0,
    styleMs: 0,
    paintMs: 0,
    compositeMs: 0,
    scriptMs: 0,
    longTaskCount: 0,
    longTaskMs: 0
  };

  const layoutNames = new Set(['Layout']);
  const styleNames = new Set(['UpdateLayoutTree', 'RecalculateStyles', 'Recalculate Style']);
  const paintNames = new Set(['Paint', 'PrePaint', 'RasterTask']);
  const compositeNames = new Set(['CompositeLayers', 'Layerize']);
  const scriptNames = new Set(['FunctionCall', 'EvaluateScript', 'EventDispatch', 'V8.Execute']);

  for (const e of events) {
    if (e.ph !== 'X' || typeof e.dur !== 'number') continue;
    const ms = e.dur / 1000;
    if (layoutNames.has(e.name)) summary.layoutMs += ms;
    if (styleNames.has(e.name)) summary.styleMs += ms;
    if (paintNames.has(e.name)) summary.paintMs += ms;
    if (compositeNames.has(e.name)) summary.compositeMs += ms;
    if (scriptNames.has(e.name)) summary.scriptMs += ms;
    if (e.name === 'RunTask' && ms >= 50) {
      summary.longTaskCount += 1;
      summary.longTaskMs += ms;
    }
  }

  const round = (v) => Number(v.toFixed(2));
  return {
    ...summary,
    layoutMs: round(summary.layoutMs),
    styleMs: round(summary.styleMs),
    paintMs: round(summary.paintMs),
    compositeMs: round(summary.compositeMs),
    scriptMs: round(summary.scriptMs),
    longTaskMs: round(summary.longTaskMs)
  };
}

function summarizeCpuProfile(profile) {
  const nodes = profile?.nodes || [];
  const samples = profile?.samples || [];
  const deltas = profile?.timeDeltas || [];
  const idToName = new Map();
  for (const node of nodes) {
    idToName.set(node.id, node.callFrame?.functionName || '(anonymous)');
  }

  const totals = new Map();
  for (let i = 0; i < samples.length; i += 1) {
    const id = samples[i];
    const deltaUs = Number(deltas[i] || 0);
    const name = idToName.get(id) || '(anonymous)';
    totals.set(name, (totals.get(name) || 0) + deltaUs / 1000);
  }

  const ranked = Array.from(totals.entries())
    .map(([name, ms]) => ({ name, ms: Number(ms.toFixed(2)) }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 16);

  const pick = (keyword) => Number(
    Array.from(totals.entries())
      .filter(([name]) => name.toLowerCase().includes(keyword.toLowerCase()))
      .reduce((sum, [, ms]) => sum + ms, 0)
      .toFixed(2)
  );

  return {
    topFunctions: ranked,
    reactRenderMs: pick('renderWithHooks') + pick('beginWork') + pick('completeWork'),
    orderPageMs: pick('OrderPage'),
    localizeMenuTextMs: pick('localizeMenuText')
  };
}

async function captureTrace(cdp, actionExpression) {
  await cdp.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    categories: [
      'devtools.timeline',
      'blink.user_timing',
      'toplevel',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame'
    ].join(',')
  });

  await cdp.evaluate(actionExpression);

  const completePromise = cdp.waitForEvent('Tracing.tracingComplete', 20000);
  await cdp.send('Tracing.end');
  const complete = await completePromise;
  const handle = complete.stream;
  let data = '';
  while (true) {
    const chunk = await cdp.send('IO.read', { handle });
    data += chunk.data || '';
    if (chunk.eof) break;
  }
  await cdp.send('IO.close', { handle });

  return JSON.parse(data);
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  chrome.stderr.on('data', () => {
    // keep quiet
  });

  try {
    for (let i = 0; i < 50; i += 1) {
      try {
        await fetch(`http://127.0.0.1:${debugPort}/json/version`);
        break;
      } catch {
        await sleep(120);
      }
    }

    const tab = await fetchJson(`http://127.0.0.1:${debugPort}/json/new?${baseUrl}/`, { method: 'PUT' });
    const cdp = new CDPClient(tab.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Profiler.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 393,
      height: 852,
      deviceScaleFactor: 2,
      mobile: true
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    const loadPromise = cdp.waitForEvent('Page.loadEventFired', 12000);
    await cdp.send('Page.navigate', { url: `${baseUrl}/` });
    await loadPromise;
    await sleep(800);

    await cdp.evaluate(`(async () => {
      localStorage.setItem('rdv_lang', 'en');
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('rdv_order_draft:')) localStorage.removeItem(key);
      }
      const loginResp = await fetch(${JSON.stringify(`${baseUrl}/api/login`)}, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'Maria', pin: '12345' })
      });
      const loginRaw = await loginResp.text();
      let loginData;
      try {
        loginData = JSON.parse(loginRaw);
      } catch {
        throw new Error(
          'login parse failed: status=' + loginResp.status +
          '; href=' + location.href +
          '; body=' + loginRaw.slice(0, 160)
        );
      }
      localStorage.setItem('rdv_token', loginData.token);
      localStorage.setItem('rdv_role', loginData.role);
      location.href = '/order?tableNo=01&guests=2';
      return true;
    })()`);

    await cdp.evaluate(`new Promise((resolve, reject) => {
      const timeout = Date.now() + 12000;
      const tick = () => {
        const ready = document.querySelectorAll("[class*='menuRow']").length > 0;
        if (ready) return resolve(true);
        if (Date.now() > timeout) return reject(new Error('menu rows timeout'));
        setTimeout(tick, 80);
      };
      tick();
    })`);

    const categoryProbe = await cdp.evaluate(`(async () => {
      const buttons = Array.from(document.querySelectorAll("[class*='categoryBtn']"));
      let best = { index: 0, count: -1, label: '' };
      for (let i = 0; i < buttons.length; i += 1) {
        buttons[i].click();
        await new Promise((r) => setTimeout(r, 120));
        const count = document.querySelectorAll("[class*='menuRow']").length;
        if (count > best.count) {
          best = { index: i, count, label: buttons[i].textContent?.trim() || '' };
        }
      }
      if (buttons[best.index]) {
        buttons[best.index].click();
      }
      await new Promise((r) => setTimeout(r, 100));
      return best;
    })()`);

    const domInfo = await cdp.evaluate(`(() => {
      const menuRows = Array.from(document.querySelectorAll("[class*='menuRow']"));
      const rowNodeCount = menuRows.map((row) => row.querySelectorAll('*').length + 1);
      const avgNodesPerRow = rowNodeCount.length
        ? rowNodeCount.reduce((sum, n) => sum + n, 0) / rowNodeCount.length
        : 0;
      const allNodes = Array.from(document.querySelectorAll('*'));
      let scrollContainers = 0;
      let fixedOrSticky = 0;
      for (const node of allNodes) {
        const style = getComputedStyle(node);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
          scrollContainers += 1;
        }
        if (style.position === 'fixed' || style.position === 'sticky') {
          fixedOrSticky += 1;
        }
      }
      return {
        domNodes: allNodes.length,
        menuRows: menuRows.length,
        avgNodesPerRow: Number(avgNodesPerRow.toFixed(2)),
        scrollContainers,
        fixedOrSticky
      };
    })()`);

    const scrollActionExpr = `(async () => {
      const candidates = [
        document.querySelector("[class*='menuPane']"),
        document.querySelector('.app-shell-main'),
        document.scrollingElement,
        document.documentElement
      ].filter(Boolean);
      const el = candidates.find((node) => node.scrollHeight > node.clientHeight + 16) || candidates[0];
      if (!el) throw new Error('scroll target not found');
      const longTasks = [];
      let observer = null;
      if (typeof PerformanceObserver !== 'undefined') {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTasks.push(entry.duration);
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
      }

      const durationMs = 3600;
      const start = performance.now();
      let last = start;
      let frames = 0;
      let dropped = 0;
      let dir = 1;

      const timer = setInterval(() => {
        const max = Math.max(0, el.scrollHeight - el.clientHeight);
        if (max <= 0) return;
        const next = el.scrollTop + dir * 96;
        if (next >= max || next <= 0) dir *= -1;
        el.scrollTop = Math.max(0, Math.min(max, next));
      }, 16);

      await new Promise((resolve) => {
        const step = (now) => {
          frames += 1;
          const delta = now - last;
          if (delta > 20) {
            dropped += Math.max(1, Math.round(delta / 16.67) - 1);
          }
          last = now;
          if (now - start >= durationMs) {
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      clearInterval(timer);
      observer?.disconnect();

      const elapsed = performance.now() - start;
      const avgLongTaskMs = longTasks.length
        ? longTasks.reduce((sum, v) => sum + v, 0) / longTasks.length
        : 0;
      return {
        elapsedMs: Number(elapsed.toFixed(2)),
        fps: Number((frames * 1000 / elapsed).toFixed(2)),
        droppedFrames: dropped,
        longTaskCount: longTasks.length,
        longTaskTotalMs: Number(longTasks.reduce((sum, v) => sum + v, 0).toFixed(2)),
        longTaskAvgMs: Number(avgLongTaskMs.toFixed(2)),
        maxScroll: Math.max(0, el.scrollHeight - el.clientHeight),
        targetClass: String(el.className || el.tagName || '')
      };
    })()`;

    const scrollTrace = await captureTrace(cdp, scrollActionExpr);
    const scrollPerf = await cdp.evaluate(scrollActionExpr);

    const addActionExpression = `(async () => {
      const row = document.querySelector("[class*='menuRow']");
      if (!row) throw new Error('menu row missing');
      const addBtn = row.querySelector("[class*='addBtn']");
      if (!addBtn) throw new Error('add button missing');

      const start = performance.now();
      addBtn.click();
      let latency = null;
      const timeoutAt = performance.now() + 2200;
      while (performance.now() < timeoutAt) {
        const badge = row.querySelector("[class*='qtyBadge']");
        if (badge && /x\s*1/.test(String(badge.textContent || '').toLowerCase())) {
          latency = performance.now() - start;
          break;
        }
        await new Promise((r) => requestAnimationFrame(() => r()));
      }
      await new Promise((r) => setTimeout(r, 280));
      return {
        latencyMs: latency === null ? null : Number(latency.toFixed(2))
      };
    })()`;

    await cdp.send('Profiler.start');
    const addResult = await cdp.evaluate(addActionExpression);
    const cpuProfileRaw = await cdp.send('Profiler.stop');
    const addCpu = summarizeCpuProfile(cpuProfileRaw.profile);

    const sheetActionExpr = `(async () => {
      const longTasks = [];
      let observer = null;
      if (typeof PerformanceObserver !== 'undefined') {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTasks.push(entry.duration);
        });
        observer.observe({ entryTypes: ['longtask'] });
      }

      const actionButton = Array.from(document.querySelectorAll('button')).find((btn) => {
        const text = String(btn.textContent || '').trim().toLowerCase();
        return text === 'actions' || text === '操作';
      });
      if (!actionButton) throw new Error('actions button not found');

      const start = performance.now();
      let last = start;
      let frames = 0;
      let dropped = 0;

      for (let i = 0; i < 5; i += 1) {
        actionButton.click();
        await new Promise((r) => setTimeout(r, 120));
        const overlay = document.querySelector('.ui-overlay');
        if (overlay) {
          overlay.click();
        }
        await new Promise((r) => setTimeout(r, 120));
      }

      await new Promise((resolve) => {
        const until = performance.now() + 600;
        const step = (now) => {
          frames += 1;
          const delta = now - last;
          if (delta > 20) dropped += Math.max(1, Math.round(delta / 16.67) - 1);
          last = now;
          if (now >= until) {
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      observer?.disconnect();
      const elapsed = performance.now() - start;

      return {
        fps: Number((frames * 1000 / elapsed).toFixed(2)),
        droppedFrames: dropped,
        longTaskCount: longTasks.length,
        longTaskTotalMs: Number(longTasks.reduce((sum, v) => sum + v, 0).toFixed(2))
      };
    })()`;

    const sheetTrace = await captureTrace(cdp, sheetActionExpr);
    const sheetPerf = await cdp.evaluate(sheetActionExpr);

    const visualBypass = await cdp.evaluate(`(() => {
      const id = 'rdv-perf-visual-bypass';
      const prev = document.getElementById(id);
      if (prev) prev.remove();
      const style = document.createElement('style');
      style.id = id;
      style.textContent = \"[class*='shiftPanel'], [class*='cartDock'], .ui-sheet, .ui-overlay, .ui-appbar__row, .bottom-nav-shell, .topbar-shell { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; box-shadow: none !important; } .ui-overlay { background: rgba(2,6,23,0.18) !important; }\";
      document.head.appendChild(style);
      return true;
    })()`);

    if (!visualBypass) {
      throw new Error('failed to inject visual bypass style');
    }

    const visualSheetPerf = await cdp.evaluate(sheetActionExpr);

    const screenshotBase64 = (await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    })).data;
    await fs.writeFile(path.join(outDir, `${label}-order.png`), screenshotBase64, 'base64');

    await cdp.send('Page.navigate', { url: `${baseUrl}/tables` });
    await cdp.evaluate(`new Promise((resolve, reject) => {
      const timeout = Date.now() + 12000;
      const tick = () => {
        if (document.querySelectorAll('.table-card').length > 0) return resolve(true);
        if (Date.now() > timeout) return reject(new Error('tables timeout'));
        setTimeout(tick, 80);
      };
      tick();
    })`);

    const tablesInfo = await cdp.evaluate(`(() => {
      const cards = document.querySelectorAll('.table-card').length;
      const domNodes = document.querySelectorAll('*').length;
      const scrollContainers = Array.from(document.querySelectorAll('*')).filter((el) => {
        const s = getComputedStyle(el);
        return (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
      }).length;
      return { cards, domNodes, scrollContainers };
    })()`);

    const tablesShot = (await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    })).data;
    await fs.writeFile(path.join(outDir, `${label}-tables.png`), tablesShot, 'base64');

    cdp.close();

    const output = {
      label,
      capturedAt: new Date().toISOString(),
      baseUrl,
      categoryProbe,
      domInfo,
      order: {
        scrollPerf,
        scrollTrace: summarizeTrace(scrollTrace),
        visualSheetPerf,
        addResult,
        addCpu,
        sheetPerf,
        sheetTrace: summarizeTrace(sheetTrace)
      },
      tables: tablesInfo
    };

    await fs.writeFile(path.join(outDir, `${label}.json`), JSON.stringify(output, null, 2));
    console.log(`Saved ${path.join(outDir, `${label}.json`)}`);
  } finally {
    chrome.kill('SIGKILL');
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
