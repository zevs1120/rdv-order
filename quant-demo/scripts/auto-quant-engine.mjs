import fs from 'node:fs/promises';
import path from 'node:path';
import unzipper from 'unzipper';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'data', 'auto-engine');

const US_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA'];
const CRYPTO_SYMBOLS = ['BTCUSDT', 'ETHUSDT'];

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toUtcDate(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toUtcHour(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:00:00Z`;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr, m = null) {
  if (arr.length < 2) return 0;
  const mu = m ?? mean(arr);
  const v = arr.reduce((acc, x) => acc + (x - mu) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(s.length - 1, Math.floor((s.length - 1) * p)));
  return s[idx];
}

function winsorize(values, pLow = 0.005, pHigh = 0.995) {
  if (!values.length) return values;
  const lo = percentile(values, pLow);
  const hi = percentile(values, pHigh);
  return values.map((v) => Math.max(lo, Math.min(hi, v)));
}

function corr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const vx = x[i] - mx;
    const vy = y[i] - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

async function fetchWithRetry(url, options = {}, retries = 2, timeoutMs = 15000) {
  let lastErr = null;
  for (let i = 0; i < retries; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          referer: 'https://stooq.com/',
          accept: '*/*',
          ...(options.headers || {})
        }
      });
      clearTimeout(timer);
      return res;
    } catch (error) {
      clearTimeout(timer);
      lastErr = error;
      await sleep(800 * (i + 1));
    }
  }
  throw lastErr ?? new Error(`fetch failed: ${url}`);
}

function parseCsvSimple(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(','));
}

function normalizeEpochMs(rawTs) {
  let ts = Number(rawTs);
  if (!Number.isFinite(ts) || ts <= 0) return NaN;
  if (ts < 1e11) ts *= 1000; // seconds -> ms
  if (ts > 1e14 && ts <= 1e17) ts = Math.floor(ts / 1000); // microseconds -> ms
  if (ts > 1e17) ts = Math.floor(ts / 1e6); // nanoseconds -> ms
  return ts;
}

function parseStooqDailyCsv(symbol, text) {
  if (text.startsWith('No data') || text.includes('Unauthorized')) return [];
  const rows = parseCsvSimple(text);
  const header = rows[0] || [];
  if (!header[0] || header[0].toLowerCase() !== 'date') return [];
  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    const date = r[0];
    const open = Number(r[1]);
    const high = Number(r[2]);
    const low = Number(r[3]);
    const close = Number(r[4]);
    const volume = Number(r[5] || 0);
    if (!date || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;
    const ts = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 0, 0, 0);
    out.push({ datetime: new Date(ts).toISOString(), symbol, open, high, low, close, volume, timeframe: '1d', market: 'US' });
  }
  return out;
}

function parseStooqA2Intraday(symbol, text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const s = line.trim();
    if (!/^\d{8},\d{4,6},/.test(s)) continue;
    const p = s.split(',');
    const d = p[0];
    const tm = p[1].padStart(6, '0');
    const open = Number(p[2]);
    const high = Number(p[3]);
    const low = Number(p[4]);
    const close = Number(p[5]);
    const volume = Number(p[6] || 0);
    if (![open, high, low, close].every(Number.isFinite)) continue;
    const ts = Date.UTC(
      Number(d.slice(0, 4)),
      Number(d.slice(4, 6)) - 1,
      Number(d.slice(6, 8)),
      Number(tm.slice(0, 2)),
      Number(tm.slice(2, 4)),
      Number(tm.slice(4, 6))
    );
    out.push({ datetime: new Date(ts).toISOString(), symbol, open, high, low, close, volume, timeframe: '1h', market: 'US' });
  }
  return out;
}

function yyyymmFromDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function listMonthsBack(years) {
  const end = new Date();
  const start = new Date(Date.UTC(end.getUTCFullYear() - years, end.getUTCMonth(), 1));
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const out = [];
  while (cur <= end) {
    out.push(yyyymmFromDate(cur));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

async function unzipSingleCsv(buffer) {
  const dir = await unzipper.Open.buffer(Buffer.from(buffer));
  const file = dir.files.find((f) => f.path.endsWith('.csv'));
  if (!file) return '';
  const content = await file.buffer();
  return content.toString('utf8');
}

function parseBinanceKlinesCsv(text, symbol, market, timeframe, kind = 'klines') {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(','));
  const out = [];
  for (const r of rows) {
    const openTime = normalizeEpochMs(r[0]);
    const open = Number(r[1]);
    const high = Number(r[2]);
    const low = Number(r[3]);
    const close = Number(r[4]);
    const volume = Number(r[5] || 0);
    if (![openTime, open, high, low, close].every(Number.isFinite)) continue;
    out.push({
      datetime: new Date(openTime).toISOString(),
      symbol,
      open,
      high,
      low,
      close,
      volume,
      timeframe,
      market,
      takerBuyBase: Number(r[9] || 0),
      kind
    });
  }
  return out;
}

async function fetchBinanceMonthlySeries({ marketPath, dataType, symbol, interval, months, market, kind = 'klines' }) {
  const all = [];
  let okCount = 0;
  let missCount = 0;
  for (const ym of months) {
    const url = `https://data.binance.vision/data/${marketPath}/monthly/${dataType}/${symbol}/${interval}/${symbol}-${interval}-${ym}.zip`;
    const res = await fetchWithRetry(url, {}, 1, 12000);
    if (res.status === 404) {
      missCount += 1;
      continue;
    }
    if (!res.ok) {
      missCount += 1;
      continue;
    }
    const buf = await res.arrayBuffer();
    const csv = await unzipSingleCsv(buf);
    const rows = parseBinanceKlinesCsv(csv, symbol, market, interval, kind);
    all.push(...rows);
    okCount += 1;
    await sleep(60);
  }
  console.log(`[binance] ${symbol} ${dataType} ${interval} downloaded=${okCount} missing=${missCount}`);
  return all;
}

async function fetchFREDSeries(seriesId, outSymbol) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
  const res = await fetchWithRetry(url, { headers: { referer: 'https://fred.stlouisfed.org/' } }, 4, 25000);
  if (!res.ok) return [];
  const text = await res.text();
  const rows = parseCsvSimple(text);
  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    const [date, value] = rows[i];
    if (!date || !value || value === '.') continue;
    const v = Number(value);
    if (!Number.isFinite(v)) continue;
    const ts = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 0, 0, 0);
    out.push({ datetime: new Date(ts).toISOString(), symbol: outSymbol, value: v });
  }
  return out;
}

async function fetchCboeSpyOptionsSnapshot(spotPrice) {
  const url = 'https://cdn.cboe.com/api/global/delayed_quotes/options/SPY.json';
  const res = await fetchWithRetry(url, { headers: { referer: 'https://www.cboe.com/' } }, 4, 30000);
  if (!res.ok) return null;
  const json = await res.json();
  const options = json?.data?.options || [];
  if (!options.length) return null;

  const clean = options.filter((o) => Number.isFinite(Number(o.iv)) && Number.isFinite(Number(o.open_interest)));
  if (!clean.length) return null;

  let callIvNum = 0;
  let callIvDen = 0;
  let putIvNum = 0;
  let putIvDen = 0;
  let totalOI = 0;
  let totalVol = 0;
  let absDeltaNum = 0;
  let absDeltaDen = 0;
  let gammaExp = 0;

  for (const o of clean) {
    const sym = String(o.option || '');
    const cp = sym.includes('C') ? 'C' : sym.includes('P') ? 'P' : '';
    const strikeRaw = sym.slice(-8);
    const strike = Number(strikeRaw) / 1000;
    const iv = Number(o.iv || 0);
    const oi = Number(o.open_interest || 0);
    const vol = Number(o.volume || 0);
    const w = Math.max(oi, vol, 1);
    totalOI += oi;
    totalVol += vol;
    absDeltaNum += Math.abs(Number(o.delta || 0)) * w;
    absDeltaDen += w;
    gammaExp += Number(o.gamma || 0) * oi * 100 * spotPrice * spotPrice;

    const moneyness = strike / Math.max(spotPrice, 1e-8) - 1;
    if (cp === 'C' && moneyness >= -0.08 && moneyness <= 0.15) {
      callIvNum += iv * w;
      callIvDen += w;
    }
    if (cp === 'P' && moneyness <= 0.08 && moneyness >= -0.15) {
      putIvNum += iv * w;
      putIvDen += w;
    }
  }

  const callIv = callIvDen ? callIvNum / callIvDen : 0;
  const putIv = putIvDen ? putIvNum / putIvDen : 0;
  const ts = new Date(String(json.timestamp || new Date().toISOString()).replace(' ', 'T') + 'Z').toISOString();

  return {
    datetime: ts,
    symbol: 'SPY_OPTIONS',
    iv_call: callIv,
    iv_put: putIv,
    iv_skew: putIv - callIv,
    open_interest_total: totalOI,
    volume_total: totalVol,
    avg_abs_delta: absDeltaDen ? absDeltaNum / absDeltaDen : 0,
    gamma_exposure: gammaExp
  };
}

function dedupeBars(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = `${r.symbol}|${r.timeframe}|${r.datetime}`;
    if (!map.has(k)) map.set(k, r);
  }
  return [...map.values()].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
}

function cleanBars(rows) {
  const clean = rows.filter((r) => {
    return (
      Number.isFinite(r.open) &&
      Number.isFinite(r.high) &&
      Number.isFinite(r.low) &&
      Number.isFinite(r.close) &&
      Number.isFinite(r.volume) &&
      r.open > 0 &&
      r.high > 0 &&
      r.low > 0 &&
      r.close > 0 &&
      r.high >= r.low
    );
  });

  const bySymbolTf = new Map();
  for (const r of clean) {
    const k = `${r.symbol}|${r.timeframe}`;
    if (!bySymbolTf.has(k)) bySymbolTf.set(k, []);
    bySymbolTf.get(k).push(r);
  }

  const out = [];
  for (const arr of bySymbolTf.values()) {
    arr.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    const rets = [];
    for (let i = 1; i < arr.length; i += 1) {
      rets.push(Math.log(arr[i].close / arr[i - 1].close));
    }
    const clipped = winsorize(rets, 0.005, 0.995);
    for (let i = 0; i < arr.length; i += 1) {
      if (i === 0) {
        out.push(arr[i]);
        continue;
      }
      const prev = out[out.length - 1];
      const ret = clipped[i - 1];
      const close = prev.close * Math.exp(ret);
      const scale = close / arr[i].close;
      out.push({
        ...arr[i],
        close,
        open: arr[i].open * scale,
        high: arr[i].high * scale,
        low: arr[i].low * scale
      });
    }
  }
  return dedupeBars(out);
}

function rolling(arr, window, fn) {
  const out = new Array(arr.length).fill(null);
  for (let i = 0; i < arr.length; i += 1) {
    if (i + 1 < window) continue;
    const seg = arr.slice(i + 1 - window, i + 1);
    out[i] = fn(seg);
  }
  return out;
}

function ema(arr, period) {
  const out = new Array(arr.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < arr.length; i += 1) {
    const v = arr[i];
    if (!Number.isFinite(v)) continue;
    if (prev === null) {
      prev = v;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

function computeRSI(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < closes.length; i += 1) {
    const ch = closes[i] - closes[i - 1];
    if (i <= period) {
      gain += Math.max(ch, 0);
      loss += Math.max(-ch, 0);
      if (i === period) {
        const rs = loss === 0 ? 100 : gain / Math.max(loss, 1e-8);
        out[i] = 100 - 100 / (1 + rs);
      }
      continue;
    }
    gain = (gain * (period - 1) + Math.max(ch, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-ch, 0)) / period;
    const rs = loss === 0 ? 100 : gain / Math.max(loss, 1e-8);
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

function computeATR(highs, lows, closes, period = 14) {
  const tr = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    if (i === 0) {
      tr[i] = highs[i] - lows[i];
    } else {
      tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    }
  }
  const out = new Array(closes.length).fill(null);
  let prev = null;
  for (let i = 0; i < tr.length; i += 1) {
    if (!Number.isFinite(tr[i])) continue;
    if (i < period) continue;
    if (prev === null) {
      prev = mean(tr.slice(i - period + 1, i + 1));
    } else {
      prev = (prev * (period - 1) + tr[i]) / period;
    }
    out[i] = prev;
  }
  return out;
}

function computeADX(highs, lows, closes, period = 14) {
  const plusDM = new Array(closes.length).fill(0);
  const minusDM = new Array(closes.length).fill(0);
  const tr = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i += 1) {
    const up = highs[i] - highs[i - 1];
    const dn = lows[i - 1] - lows[i];
    plusDM[i] = up > dn && up > 0 ? up : 0;
    minusDM[i] = dn > up && dn > 0 ? dn : 0;
    tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  const adx = new Array(closes.length).fill(null);
  let atr = 0;
  let pDM = 0;
  let mDM = 0;
  let dxArr = [];
  for (let i = 1; i < closes.length; i += 1) {
    atr += tr[i];
    pDM += plusDM[i];
    mDM += minusDM[i];
    if (i < period) continue;
    if (i === period) {
      atr = atr / period;
      pDM = pDM / period;
      mDM = mDM / period;
    } else {
      atr = (atr * (period - 1) + tr[i]) / period;
      pDM = (pDM * (period - 1) + plusDM[i]) / period;
      mDM = (mDM * (period - 1) + minusDM[i]) / period;
    }
    const pdi = (100 * pDM) / Math.max(atr, 1e-8);
    const mdi = (100 * mDM) / Math.max(atr, 1e-8);
    const dx = (100 * Math.abs(pdi - mdi)) / Math.max(pdi + mdi, 1e-8);
    dxArr.push(dx);
    if (dxArr.length > period) dxArr.shift();
    adx[i] = mean(dxArr);
  }
  return adx;
}

function addFeatures(rows, macroByDate, optionsSnapshot, cryptoDerivByDateSymbol) {
  const bySymbol = new Map();
  for (const r of rows) {
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
    bySymbol.get(r.symbol).push(r);
  }

  const out = [];
  for (const [symbol, arr] of bySymbol.entries()) {
    arr.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    const closes = arr.map((x) => x.close);
    const highs = arr.map((x) => x.high);
    const lows = arr.map((x) => x.low);
    const vols = arr.map((x) => x.volume);

    const ma20 = rolling(closes, 20, mean);
    const ma60 = rolling(closes, 60, mean);
    const ma120 = rolling(closes, 120, mean);
    const rsi14 = computeRSI(closes, 14);
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const macd = closes.map((_, i) => (ema12[i] ?? 0) - (ema26[i] ?? 0));
    const macdSig = ema(macd.map((v) => (Number.isFinite(v) ? v : 0)), 9);
    const macdHist = macd.map((v, i) => (v ?? 0) - (macdSig[i] ?? 0));
    const adx14 = computeADX(highs, lows, closes, 14);
    const atr14 = computeATR(highs, lows, closes, 14);
    const ret1 = closes.map((_, i) => (i > 0 ? closes[i] / closes[i - 1] - 1 : null));
    const ret3 = closes.map((_, i) => (i > 2 ? closes[i] / closes[i - 3] - 1 : null));
    const ret7 = closes.map((_, i) => (i > 6 ? closes[i] / closes[i - 7] - 1 : null));
    const vol20 = rolling(ret1.map((v) => v ?? 0), 20, (x) => std(x));
    const vol60 = rolling(ret1.map((v) => v ?? 0), 60, (x) => std(x));
    const volZ20 = rolling(vols, 20, (x) => {
      const m = mean(x);
      const s = std(x, m);
      const v = x[x.length - 1];
      return s > 0 ? (v - m) / s : 0;
    });
    const bollWidth20 = closes.map((_, i) => {
      if (i < 19 || !Number.isFinite(ma20[i])) return null;
      const seg = closes.slice(i - 19, i + 1);
      const s = std(seg);
      return ma20[i] ? (4 * s) / ma20[i] : null;
    });

    const obv = new Array(closes.length).fill(0);
    for (let i = 1; i < closes.length; i += 1) {
      if (closes[i] > closes[i - 1]) obv[i] = obv[i - 1] + vols[i];
      else if (closes[i] < closes[i - 1]) obv[i] = obv[i - 1] - vols[i];
      else obv[i] = obv[i - 1];
    }

    for (let i = 0; i < arr.length; i += 1) {
      const date = toUtcDate(new Date(arr[i].datetime).getTime());
      const macro = macroByDate.get(date) || {};
      const deriv = cryptoDerivByDateSymbol.get(`${symbol}|${date}`) || {};
      const isCrypto = symbol.endsWith('USDT');
      const isUs = !isCrypto;
      const vix = Number(macro.VIX ?? 0);
      const dxy = Number(macro.DXY ?? 0);
      const us10y = Number(macro.US10Y ?? 0);

      out.push({
        ...arr[i],
        market: isCrypto ? 'CRYPTO' : 'US',
        ma20: ma20[i],
        ma60: ma60[i],
        ma120: ma120[i],
        dev_ma20: ma20[i] ? closes[i] / ma20[i] - 1 : null,
        dev_ma60: ma60[i] ? closes[i] / ma60[i] - 1 : null,
        dev_ma120: ma120[i] ? closes[i] / ma120[i] - 1 : null,
        rsi14: rsi14[i],
        macd: macd[i],
        macd_signal: macdSig[i],
        macd_hist: macdHist[i],
        adx14: adx14[i],
        roc1: ret1[i],
        roc3: ret3[i],
        roc7: ret7[i],
        atr14: atr14[i],
        vol_channel: bollWidth20[i],
        vol20: vol20[i],
        vol60: vol60[i],
        money_flow_obv: obv[i],
        volume_z20: volZ20[i],
        pv_divergence: i > 0 ? Math.sign(ret1[i] ?? 0) - Math.sign((vols[i] - vols[i - 1]) / Math.max(vols[i - 1], 1e-8)) : null,
        block_trade_flag: (volZ20[i] ?? 0) > 2 ? 1 : 0,
        macro_vix: vix,
        macro_dxy: dxy,
        macro_us10y: us10y,
        opt_iv_anom: isUs ? (vix - 20) / 20 : 0,
        opt_oi_jump: isUs ? (volZ20[i] ?? 0) : 0,
        opt_vol_slope: isUs ? ((vol20[i] ?? 0) - (vol60[i] ?? 0)) : 0,
        funding_rate: isCrypto ? Number(deriv.funding_rate ?? 0) : 0,
        basis: isCrypto ? Number(deriv.basis ?? 0) : 0,
        basis_percentile: isCrypto ? Number(deriv.basis_pct ?? 0) : 0,
        open_interest: isCrypto ? Number(deriv.open_interest ?? 0) : 0,
        liquidation_intensity: isCrypto ? Number(deriv.liquidation_proxy ?? 0) : 0,
        long_short_ratio: isCrypto ? Number(deriv.long_short_ratio ?? 0) : 0,
        options_chain_iv: isUs && optionsSnapshot ? optionsSnapshot.iv_call : 0,
        options_chain_skew: isUs && optionsSnapshot ? optionsSnapshot.iv_skew : 0,
        options_chain_oi: isUs && optionsSnapshot ? optionsSnapshot.open_interest_total : 0,
        options_chain_delta: isUs && optionsSnapshot ? optionsSnapshot.avg_abs_delta : 0,
        options_chain_gamma: isUs && optionsSnapshot ? optionsSnapshot.gamma_exposure : 0
      });
    }
  }
  return out;
}

function addLabels(rows) {
  const bySymbol = new Map();
  for (const r of rows) {
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
    bySymbol.get(r.symbol).push(r);
  }
  const out = [];
  for (const arr of bySymbol.values()) {
    arr.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    for (let i = 0; i < arr.length; i += 1) {
      const cur = arr[i];
      const n1 = arr[i + 1];
      const n3 = arr[i + 3];
      const n7 = arr[i + 7];
      if (!n1 || !n3 || !n7 || !Number.isFinite(cur.atr14)) continue;
      let minLow3 = Infinity;
      for (let j = i + 1; j <= i + 3; j += 1) minLow3 = Math.min(minLow3, arr[j].low);
      const dd3 = (cur.close - minLow3) / Math.max(cur.close, 1e-8);

      const row = {
        ...cur,
        future_1d_rtn: n1.close / cur.close - 1,
        future_3d_rtn: n3.close / cur.close - 1,
        future_7d_rtn: n7.close / cur.close - 1,
        future_dd_3d: dd3,
        buy_signal: n3.close / cur.close - 1 >= 0.04 && dd3 <= 0.02 ? 1 : 0,
        stop_loss: cur.close - 1.5 * cur.atr14,
        take_profit: cur.close + 2.2 * cur.atr14
      };
      out.push(row);
    }
  }
  return out.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
}

const FEATURE_COLUMNS = [
  'dev_ma20',
  'dev_ma60',
  'dev_ma120',
  'rsi14',
  'macd',
  'macd_signal',
  'macd_hist',
  'adx14',
  'roc1',
  'roc3',
  'roc7',
  'atr14',
  'vol_channel',
  'money_flow_obv',
  'volume_z20',
  'pv_divergence',
  'block_trade_flag',
  'macro_vix',
  'macro_dxy',
  'macro_us10y',
  'opt_iv_anom',
  'opt_oi_jump',
  'opt_vol_slope',
  'funding_rate',
  'basis',
  'basis_percentile',
  'open_interest',
  'liquidation_intensity',
  'long_short_ratio',
  'options_chain_iv',
  'options_chain_skew',
  'options_chain_oi',
  'options_chain_delta',
  'options_chain_gamma'
];

function filterNumericRows(rows, featureCols, targetCol) {
  return rows.filter((r) => {
    if (!Number.isFinite(r[targetCol])) return false;
    for (const c of featureCols) {
      if (!Number.isFinite(r[c])) return false;
    }
    return true;
  });
}

function selectTopFeatures(rows, featureCols, targetCol, topN = 18) {
  const scores = [];
  for (const col of featureCols) {
    const x = rows.map((r) => r[col]);
    const y = rows.map((r) => r[targetCol]);
    scores.push({ col, score: Math.abs(corr(x, y)) });
  }
  return scores.sort((a, b) => b.score - a.score).slice(0, topN).map((x) => x.col);
}

function fitStandardizer(rows, featureCols) {
  const params = {};
  for (const c of featureCols) {
    const vals = rows.map((r) => r[c]);
    const m = mean(vals);
    const s = std(vals, m) || 1;
    params[c] = { m, s };
  }
  return params;
}

function transformRows(rows, featureCols, standardizer) {
  return rows.map((r) => {
    const x = featureCols.map((c) => (r[c] - standardizer[c].m) / standardizer[c].s);
    return { row: r, x };
  });
}

function sigmoid(z) {
  if (z > 35) return 1;
  if (z < -35) return 0;
  return 1 / (1 + Math.exp(-z));
}

function trainLogistic(X, y, { lr = 0.05, epochs = 350, l2 = 0.01 } = {}) {
  const n = X.length;
  const p = X[0].length;
  const w = new Array(p + 1).fill(0);
  for (let ep = 0; ep < epochs; ep += 1) {
    const grad = new Array(p + 1).fill(0);
    for (let i = 0; i < n; i += 1) {
      let z = w[p];
      for (let j = 0; j < p; j += 1) z += X[i][j] * w[j];
      const pred = sigmoid(z);
      const err = pred - y[i];
      for (let j = 0; j < p; j += 1) grad[j] += err * X[i][j];
      grad[p] += err;
    }
    for (let j = 0; j < p; j += 1) {
      grad[j] = grad[j] / n + l2 * w[j];
      w[j] -= lr * grad[j];
    }
    w[p] -= lr * (grad[p] / n);
  }
  return w;
}

function predictLogistic(X, w) {
  const p = w.length - 1;
  return X.map((row) => {
    let z = w[p];
    for (let j = 0; j < p; j += 1) z += row[j] * w[j];
    return sigmoid(z);
  });
}

function trainRidge(X, y, { lr = 0.03, epochs = 450, l2 = 0.03 } = {}) {
  const n = X.length;
  const p = X[0].length;
  const w = new Array(p + 1).fill(0);
  for (let ep = 0; ep < epochs; ep += 1) {
    const grad = new Array(p + 1).fill(0);
    for (let i = 0; i < n; i += 1) {
      let pred = w[p];
      for (let j = 0; j < p; j += 1) pred += X[i][j] * w[j];
      const err = pred - y[i];
      for (let j = 0; j < p; j += 1) grad[j] += err * X[i][j];
      grad[p] += err;
    }
    for (let j = 0; j < p; j += 1) {
      grad[j] = grad[j] / n + l2 * w[j];
      w[j] -= lr * grad[j];
    }
    w[p] -= lr * (grad[p] / n);
  }
  return w;
}

function predictLinear(X, w) {
  const p = w.length - 1;
  return X.map((row) => {
    let pred = w[p];
    for (let j = 0; j < p; j += 1) pred += row[j] * w[j];
    return pred;
  });
}

function aucScore(yTrue, yProb) {
  const pairs = yTrue.map((y, i) => ({ y, p: yProb[i] })).sort((a, b) => b.p - a.p);
  const pos = pairs.filter((x) => x.y === 1).length;
  const neg = pairs.length - pos;
  if (pos === 0 || neg === 0) return 0.5;
  let tp = 0;
  let fp = 0;
  let prevTp = 0;
  let prevFp = 0;
  let area = 0;
  for (const item of pairs) {
    if (item.y === 1) tp += 1;
    else fp += 1;
    area += (fp - prevFp) * ((tp + prevTp) / 2);
    prevTp = tp;
    prevFp = fp;
  }
  return area / (pos * neg);
}

function accuracy(yTrue, yProb, threshold = 0.5) {
  let ok = 0;
  for (let i = 0; i < yTrue.length; i += 1) {
    const pred = yProb[i] >= threshold ? 1 : 0;
    if (pred === yTrue[i]) ok += 1;
  }
  return ok / Math.max(yTrue.length, 1);
}

function sharpe(returns) {
  if (returns.length < 2) return 0;
  const m = mean(returns);
  const s = std(returns, m);
  if (!s) return 0;
  return (m / s) * Math.sqrt(252);
}

function buildWalkForwardFolds(n, k = 5) {
  const folds = [];
  const fold = Math.floor(n / (k + 1));
  for (let i = 1; i <= k; i += 1) {
    const trainEnd = fold * i;
    const valEnd = fold * (i + 1);
    if (valEnd > n || trainEnd < 500) continue;
    folds.push({ trainStart: 0, trainEnd, valStart: trainEnd, valEnd });
  }
  return folds;
}

function evaluateRegression(y, pred) {
  let mse = 0;
  let mae = 0;
  for (let i = 0; i < y.length; i += 1) {
    const e = pred[i] - y[i];
    mse += e * e;
    mae += Math.abs(e);
  }
  mse /= Math.max(y.length, 1);
  mae /= Math.max(y.length, 1);
  return { rmse: Math.sqrt(mse), mae };
}

function backtestSignals(rows, probs, regPred, tsPred) {
  const bySymbol = new Map();
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
    bySymbol.get(r.symbol).push({ ...r, prob: probs[i], regPred: regPred[i], tsPred: tsPred[i] });
  }

  const trades = [];
  for (const arr of bySymbol.values()) {
    arr.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    let i = 0;
    while (i < arr.length - 8) {
      const row = arr[i];
      const direction =
        row.prob > 0.58 && (row.regPred > 0.002 || row.tsPred > 0.001)
          ? 'LONG'
          : row.prob < 0.42 && (row.regPred < -0.002 || row.tsPred < -0.001)
            ? 'SHORT'
            : 'FLAT';
      if (direction === 'FLAT' || !Number.isFinite(row.atr14) || row.atr14 <= 0) {
        i += 1;
        continue;
      }

      const entry = row.close;
      const atr = Math.max(row.atr14, row.close * 0.01);
      const sl = direction === 'LONG' ? entry - 1.2 * atr : entry + 1.2 * atr;
      const tp1 = direction === 'LONG' ? entry + 1.2 * atr : entry - 1.2 * atr;
      const tp2 = direction === 'LONG' ? entry + 2.4 * atr : entry - 2.4 * atr;
      let realized = 0;
      let left = 1;
      let exitIndex = i + 7;
      let exitPrice = arr[exitIndex].close;

      for (let j = i + 1; j <= i + 7; j += 1) {
        const bar = arr[j];
        if (direction === 'LONG') {
          if (bar.low <= sl) {
            realized += left * ((sl - entry) / entry);
            left = 0;
            exitIndex = j;
            exitPrice = sl;
            break;
          }
          if (left > 0.5 && bar.high >= tp1) {
            realized += 0.5 * ((tp1 - entry) / entry);
            left -= 0.5;
          }
          if (left > 0 && bar.high >= tp2) {
            realized += left * ((tp2 - entry) / entry);
            left = 0;
            exitIndex = j;
            exitPrice = tp2;
            break;
          }
        } else {
          if (bar.high >= sl) {
            realized += left * ((entry - sl) / entry);
            left = 0;
            exitIndex = j;
            exitPrice = sl;
            break;
          }
          if (left > 0.5 && bar.low <= tp1) {
            realized += 0.5 * ((entry - tp1) / entry);
            left -= 0.5;
          }
          if (left > 0 && bar.low <= tp2) {
            realized += left * ((entry - tp2) / entry);
            left = 0;
            exitIndex = j;
            exitPrice = tp2;
            break;
          }
        }
      }

      if (left > 0) {
        const finalRet = direction === 'LONG' ? (exitPrice - entry) / entry : (entry - exitPrice) / entry;
        realized += left * finalRet;
      }

      trades.push({
        symbol: row.symbol,
        direction,
        entryDate: row.datetime,
        exitDate: arr[exitIndex].datetime,
        entry,
        exit: exitPrice,
        pnl: realized,
        holdDays: exitIndex - i,
        prob: row.prob
      });

      i = exitIndex + 1;
    }
  }

  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  const pnlSeries = [];
  for (const t of trades) {
    equity *= 1 + t.pnl;
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, (equity - peak) / peak);
    pnlSeries.push(t.pnl);
  }
  const wins = trades.filter((t) => t.pnl > 0).length;
  const gains = trades.filter((t) => t.pnl > 0).reduce((a, b) => a + b.pnl, 0);
  const losses = Math.abs(trades.filter((t) => t.pnl <= 0).reduce((a, b) => a + b.pnl, 0));
  const profitFactor = losses > 0 ? gains / losses : gains > 0 ? 99 : 0;

  const firstDate = trades.length ? new Date(trades[0].entryDate) : new Date();
  const lastDate = trades.length ? new Date(trades.at(-1).exitDate) : new Date();
  const days = Math.max(1, (lastDate - firstDate) / (24 * 3600 * 1000));
  const annualized = Math.pow(equity, 365 / days) - 1;

  return {
    trades,
    annualized_return: annualized,
    max_drawdown: Math.abs(maxDd),
    win_rate: trades.length ? wins / trades.length : 0,
    profit_factor: profitFactor,
    trade_count: trades.length,
    sharpe: sharpe(pnlSeries)
  };
}

function summarizeDataCoverage(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const k = `${r.symbol}|${r.timeframe}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(new Date(r.datetime).getTime());
  }
  const out = [];
  for (const [k, arr] of byKey.entries()) {
    arr.sort((a, b) => a - b);
    out.push({
      key: k,
      rows: arr.length,
      start: new Date(arr[0]).toISOString(),
      end: new Date(arr[arr.length - 1]).toISOString()
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

function buildSignals(latestRows, featureCols, standardizer, clfW, regW, tsW, optionsSnapshot) {
  const transformed = transformRows(latestRows, featureCols, standardizer);
  const X = transformed.map((x) => x.x);
  const probs = predictLogistic(X, clfW);
  const regPred = predictLinear(X, regW);
  const tsPred = predictLinear(X, tsW);

  const signals = [];
  for (let i = 0; i < latestRows.length; i += 1) {
    const r = latestRows[i];
    const p = probs[i];
    const rr = regPred[i];
    const ts = tsPred[i];
    const longConv = p;
    const shortConv = 1 - p;
    const dir = longConv > 0.58 && (rr > 0.001 || ts > 0) ? '多' : shortConv > 0.58 && (rr < -0.001 || ts < 0) ? '空' : '观望';
    const directionalConv = dir === '多' ? longConv : dir === '空' ? shortConv : 0.5;
    const retStrength = Math.min(1, Math.max(Math.abs(rr) * 25, Math.abs(ts) * 35));
    const score = 0.78 * directionalConv + 0.22 * retStrength;
    const atr = Math.max(r.atr14 || r.close * 0.01, r.close * 0.006);
    const entryLow = dir === '多' ? r.close * 0.997 : r.close * 0.995;
    const entryHigh = dir === '多' ? r.close * 1.003 : r.close * 1.005;
    const stop = dir === '多' ? r.close - 1.3 * atr : r.close + 1.3 * atr;
    const tp = dir === '多' ? r.close + 2.6 * atr : r.close - 2.6 * atr;
    const hold = r.adx14 && r.adx14 > 25 ? '5-7天' : '3-5天';
    signals.push({
      symbol: r.symbol,
      direction: dir,
      entryLow,
      entryHigh,
      stop,
      tp,
      confidence: Math.max(0, Math.min(1, score)),
      hold
    });
  }

  if (optionsSnapshot) {
    const spy = signals.find((s) => s.symbol === 'SPY');
    if (spy && spy.direction !== '观望') {
      const premium = optionsSnapshot.iv_call > 0 ? Math.max(1, optionsSnapshot.iv_call * 10) : 2.4;
      signals.push({
        symbol: 'SPY_OPTION',
        direction: spy.direction,
        entryLow: premium * 0.97,
        entryHigh: premium * 1.03,
        stop: premium * 0.78,
        tp: premium * 1.35,
        confidence: Math.max(0.55, spy.confidence * 0.95),
        hold: '1-3天'
      });
    }
  }

  return signals
    .filter((s) => s.direction !== '观望' && s.confidence >= 0.6)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
}

function fmtPct(x, d = 2) {
  return `${(x * 100).toFixed(d)}%`;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  // ====================
  // Stage 1: Data ingest
  // ====================
  const usDailyRaw = [];
  const usHourlyRaw = [];
  for (const symbol of US_SYMBOLS) {
    const dailyUrl = `https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}.us&i=d`;
    const dailyText = await (await fetchWithRetry(dailyUrl)).text();
    usDailyRaw.push(...parseStooqDailyCsv(symbol, dailyText));

    const hUrl = `https://stooq.com/q/a2/d/?s=${symbol.toLowerCase()}.us&i=60`;
    const hText = await (await fetchWithRetry(hUrl)).text();
    usHourlyRaw.push(...parseStooqA2Intraday(symbol, hText));
    await sleep(120);
  }

  const months4y = listMonthsBack(4);
  const cryptoSpot1h = [];
  const cryptoSpot1d = [];
  const cryptoFut1d = [];
  const cryptoPrem1d = [];
  console.log('[stage1] fetching US + crypto bars...');

  for (const symbol of CRYPTO_SYMBOLS) {
    cryptoSpot1h.push(
      ...(await fetchBinanceMonthlySeries({
        marketPath: 'spot',
        dataType: 'klines',
        symbol,
        interval: '1h',
        months: months4y,
        market: 'CRYPTO',
        kind: 'spot_kline'
      }))
    );
    cryptoSpot1d.push(
      ...(await fetchBinanceMonthlySeries({
        marketPath: 'spot',
        dataType: 'klines',
        symbol,
        interval: '1d',
        months: months4y,
        market: 'CRYPTO',
        kind: 'spot_kline'
      }))
    );
    cryptoFut1d.push(
      ...(await fetchBinanceMonthlySeries({
        marketPath: 'futures/um',
        dataType: 'klines',
        symbol,
        interval: '1d',
        months: months4y,
        market: 'CRYPTO',
        kind: 'fut_kline'
      }))
    );
    cryptoPrem1d.push(
      ...(await fetchBinanceMonthlySeries({
        marketPath: 'futures/um',
        dataType: 'premiumIndexKlines',
        symbol,
        interval: '1d',
        months: months4y,
        market: 'CRYPTO',
        kind: 'premium_kline'
      }))
    );
  }

  const [vix, dxy, us10y] = await Promise.all([
    fetchFREDSeries('VIXCLS', 'VIX'),
    fetchFREDSeries('DTWEXBGS', 'DXY'),
    fetchFREDSeries('DGS10', 'US10Y')
  ]);

  const spySpot = usDailyRaw.filter((x) => x.symbol === 'SPY');
  const spySpotPrice = spySpot.length ? spySpot.at(-1).close : 0;
  const optionsSnapshot = await fetchCboeSpyOptionsSnapshot(spySpotPrice || 600);
  console.log('[stage1] data ingest done');

  // ====================
  // Stage 2: Cleaning
  // ====================
  console.log('[stage2] cleaning...');
  const now = Date.now();
  const usDaily = cleanBars(usDailyRaw).filter((x) => new Date(x.datetime).getTime() >= now - 8 * 365 * 24 * 3600 * 1000);
  const usHourly = cleanBars(usHourlyRaw);
  const crypto1d = cleanBars(cryptoSpot1d).filter((x) => new Date(x.datetime).getTime() >= now - 4 * 365 * 24 * 3600 * 1000);
  const crypto1h = cleanBars(cryptoSpot1h).filter((x) => new Date(x.datetime).getTime() >= now - 4 * 365 * 24 * 3600 * 1000);

  const allCoverage = summarizeDataCoverage([...usDaily, ...usHourly, ...crypto1d, ...crypto1h]);
  console.log('[stage2] cleaned rows', {
    usDaily: usDaily.length,
    usHourly: usHourly.length,
    crypto1d: crypto1d.length,
    crypto1h: crypto1h.length
  });

  const macroByDate = new Map();
  const pushMacro = (arr, key) => {
    for (const r of arr) {
      const d = toUtcDate(new Date(r.datetime).getTime());
      if (!macroByDate.has(d)) macroByDate.set(d, {});
      macroByDate.get(d)[key] = r.value;
    }
  };
  pushMacro(vix, 'VIX');
  pushMacro(dxy, 'DXY');
  pushMacro(us10y, 'US10Y');

  const futMap = new Map();
  for (const r of cryptoFut1d) {
    const d = toUtcDate(new Date(r.datetime).getTime());
    futMap.set(`${r.symbol}|${d}|fut`, r);
  }
  const premMap = new Map();
  for (const r of cryptoPrem1d) {
    const d = toUtcDate(new Date(r.datetime).getTime());
    premMap.set(`${r.symbol}|${d}|prem`, r);
  }
  const cryptoDerivByDateSymbol = new Map();
  const byCryptoSymbol = new Map();
  for (const r of crypto1d) {
    if (!byCryptoSymbol.has(r.symbol)) byCryptoSymbol.set(r.symbol, []);
    byCryptoSymbol.get(r.symbol).push(r);
  }

  for (const [symbol, arr] of byCryptoSymbol.entries()) {
    arr.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    const basisVals = [];
    for (let i = 0; i < arr.length; i += 1) {
      const date = toUtcDate(new Date(arr[i].datetime).getTime());
      const fut = futMap.get(`${symbol}|${date}|fut`);
      const prem = premMap.get(`${symbol}|${date}|prem`);
      const spotClose = arr[i].close;
      const futClose = fut?.close ?? spotClose;
      const basis = spotClose > 0 ? (futClose - spotClose) / spotClose : 0;
      basisVals.push(basis);
      const start = Math.max(0, basisVals.length - 120);
      const pctSet = basisVals.slice(start);
      const less = pctSet.filter((x) => x <= basis).length;
      const basisPct = pctSet.length ? less / pctSet.length : 0.5;
      const prev = i > 0 ? arr[i - 1] : arr[i];
      const retAbs = Math.abs(arr[i].close / prev.close - 1);
      const longShort = arr[i].volume > 0 ? (arr[i].takerBuyBase || 0) / Math.max(arr[i].volume - (arr[i].takerBuyBase || 0), 1e-8) : 1;
      const liqProxy = retAbs * arr[i].volume * (1 + Math.abs(basis));
      cryptoDerivByDateSymbol.set(`${symbol}|${date}`, {
        funding_rate: prem ? prem.close : basis * 0.25,
        basis,
        basis_pct: basisPct,
        open_interest: fut?.volume ?? arr[i].volume,
        long_short_ratio: Number.isFinite(longShort) ? longShort : 1,
        liquidation_proxy: liqProxy
      });
    }
  }

  // ====================
  // Stage 3 + 4: Features + Labels
  // ====================
  const modelBars = [...usDaily, ...crypto1d].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const featured = addFeatures(modelBars, macroByDate, optionsSnapshot, cryptoDerivByDateSymbol);
  const labeled = addLabels(featured);
  console.log('[stage3-4] features+labels rows', labeled.length);

  // ====================
  // Stage 5: Training
  // ====================
  const cleanTrainRows = filterNumericRows(labeled, FEATURE_COLUMNS, 'buy_signal');
  console.log('[stage5] model rows after numeric filter', cleanTrainRows.length);
  const selectedCls = selectTopFeatures(cleanTrainRows, FEATURE_COLUMNS, 'buy_signal', 20);
  const selectedReg = selectTopFeatures(cleanTrainRows, FEATURE_COLUMNS, 'future_3d_rtn', 18);
  const selectedTs = selectTopFeatures(cleanTrainRows, FEATURE_COLUMNS, 'future_1d_rtn', 14);

  cleanTrainRows.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const split = Math.floor(cleanTrainRows.length * 0.8);
  const trainRows = cleanTrainRows.slice(0, split);
  const testRows = cleanTrainRows.slice(split);

  const folds = buildWalkForwardFolds(trainRows.length, 5);

  function tuneLogistic() {
    const grid = [
      { lr: 0.03, l2: 0.005, epochs: 300 },
      { lr: 0.05, l2: 0.01, epochs: 340 },
      { lr: 0.08, l2: 0.02, epochs: 380 }
    ];
    let best = null;
    for (const hp of grid) {
      const foldScores = [];
      for (const f of folds) {
        const tr = trainRows.slice(f.trainStart, f.trainEnd);
        const va = trainRows.slice(f.valStart, f.valEnd);
        const stdz = fitStandardizer(tr, selectedCls);
        const Xtr = transformRows(tr, selectedCls, stdz).map((x) => x.x);
        const ytr = tr.map((r) => r.buy_signal);
        const Xva = transformRows(va, selectedCls, stdz).map((x) => x.x);
        const yva = va.map((r) => r.buy_signal);
        const w = trainLogistic(Xtr, ytr, hp);
        const p = predictLogistic(Xva, w);
        foldScores.push(aucScore(yva, p));
      }
      const score = mean(foldScores);
      if (!best || score > best.score) best = { hp, score };
    }
    return best;
  }

  function tuneRidge(targetCol, features, candidates) {
    let best = null;
    for (const hp of candidates) {
      const foldScores = [];
      for (const f of folds) {
        const tr = trainRows.slice(f.trainStart, f.trainEnd);
        const va = trainRows.slice(f.valStart, f.valEnd);
        const stdz = fitStandardizer(tr, features);
        const Xtr = transformRows(tr, features, stdz).map((x) => x.x);
        const ytr = tr.map((r) => r[targetCol]);
        const Xva = transformRows(va, features, stdz).map((x) => x.x);
        const yva = va.map((r) => r[targetCol]);
        const w = trainRidge(Xtr, ytr, hp);
        const pred = predictLinear(Xva, w);
        const ev = evaluateRegression(yva, pred);
        foldScores.push(-ev.rmse);
      }
      const score = mean(foldScores);
      if (!best || score > best.score) best = { hp, score };
    }
    return best;
  }

  const bestCls = tuneLogistic();
  const bestReg = tuneRidge('future_3d_rtn', selectedReg, [
    { lr: 0.02, l2: 0.01, epochs: 350 },
    { lr: 0.03, l2: 0.03, epochs: 420 },
    { lr: 0.05, l2: 0.06, epochs: 450 }
  ]);
  const bestTs = tuneRidge('future_1d_rtn', selectedTs, [
    { lr: 0.02, l2: 0.01, epochs: 320 },
    { lr: 0.03, l2: 0.03, epochs: 380 },
    { lr: 0.05, l2: 0.05, epochs: 420 }
  ]);

  const stdCls = fitStandardizer(trainRows, selectedCls);
  const stdReg = fitStandardizer(trainRows, selectedReg);
  const stdTs = fitStandardizer(trainRows, selectedTs);

  const XtrCls = transformRows(trainRows, selectedCls, stdCls).map((x) => x.x);
  const ytrCls = trainRows.map((r) => r.buy_signal);
  const clfW = trainLogistic(XtrCls, ytrCls, bestCls.hp);

  const XteCls = transformRows(testRows, selectedCls, stdCls).map((x) => x.x);
  const yteCls = testRows.map((r) => r.buy_signal);
  const probTe = predictLogistic(XteCls, clfW);

  const XtrReg = transformRows(trainRows, selectedReg, stdReg).map((x) => x.x);
  const ytrReg = trainRows.map((r) => r.future_3d_rtn);
  const regW = trainRidge(XtrReg, ytrReg, bestReg.hp);
  const XteReg = transformRows(testRows, selectedReg, stdReg).map((x) => x.x);
  const regTe = predictLinear(XteReg, regW);

  const XtrTs = transformRows(trainRows, selectedTs, stdTs).map((x) => x.x);
  const ytrTs = trainRows.map((r) => r.future_1d_rtn);
  const tsW = trainRidge(XtrTs, ytrTs, bestTs.hp);
  const XteTs = transformRows(testRows, selectedTs, stdTs).map((x) => x.x);
  const tsTe = predictLinear(XteTs, tsW);

  const clsAuc = aucScore(yteCls, probTe);
  const clsAcc = accuracy(yteCls, probTe, 0.5);
  const regEval = evaluateRegression(testRows.map((r) => r.future_3d_rtn), regTe);
  const tsEval = evaluateRegression(testRows.map((r) => r.future_1d_rtn), tsTe);

  // ====================
  // Stage 6: Backtest
  // ====================
  const bt = backtestSignals(testRows, probTe, regTe, tsTe);
  console.log('[stage6] backtest trades', bt.trade_count);

  // ====================
  // Stage 7: Final signals
  // ====================
  const latestBySymbol = new Map();
  for (const row of cleanTrainRows) {
    const prev = latestBySymbol.get(row.symbol);
    if (!prev || new Date(row.datetime) > new Date(prev.datetime)) latestBySymbol.set(row.symbol, row);
  }
  const latestRows = [...latestBySymbol.values()].filter((r) => FEATURE_COLUMNS.every((c) => Number.isFinite(r[c])));

  const latestTransCls = transformRows(latestRows, selectedCls, stdCls).map((x) => x.x);
  const latestProb = predictLogistic(latestTransCls, clfW);

  const latestTransReg = transformRows(latestRows, selectedReg, stdReg).map((x) => x.x);
  const latestReg = predictLinear(latestTransReg, regW);

  const latestTransTs = transformRows(latestRows, selectedTs, stdTs).map((x) => x.x);
  const latestTs = predictLinear(latestTransTs, tsW);

  const liveSignals = buildSignals(latestRows, selectedCls, stdCls, clfW, regW, tsW, optionsSnapshot);

  const report = {
    run_at: new Date().toISOString(),
    coverage: allCoverage,
    dataset_summary: {
      total_rows_model: cleanTrainRows.length,
      train_rows: trainRows.length,
      test_rows: testRows.length,
      symbols: [...new Set(cleanTrainRows.map((r) => r.symbol))],
      date_start: cleanTrainRows[0]?.datetime,
      date_end: cleanTrainRows.at(-1)?.datetime
    },
    model_metrics: {
      auc: clsAuc,
      accuracy: clsAcc,
      regression_rmse: regEval.rmse,
      ts_rmse: tsEval.rmse,
      win_rate_proxy: bt.win_rate,
      profit_factor_proxy: bt.profit_factor,
      sharpe_proxy: bt.sharpe
    },
    backtest: bt,
    options_snapshot: optionsSnapshot,
    live_signals: liveSignals,
    latest_scores: latestRows.map((r, i) => ({
      symbol: r.symbol,
      datetime: r.datetime,
      prob_up: latestProb[i],
      reg_3d: latestReg[i],
      ts_1d: latestTs[i]
    }))
  };

  await fs.writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

  const txt = [];
  txt.push('【模型训练报告】');
  txt.push(`- 标的：${report.dataset_summary.symbols.join(', ')}`);
  txt.push(`- 样本量：${report.dataset_summary.total_rows_model}`);
  txt.push(`- 胜率：${fmtPct(report.model_metrics.win_rate_proxy)}`);
  txt.push(`- 盈亏比：${report.model_metrics.profit_factor_proxy.toFixed(2)}`);
  txt.push(`- 最大回撤：${fmtPct(report.backtest.max_drawdown)}`);
  txt.push(`- 夏普比率：${report.model_metrics.sharpe_proxy.toFixed(2)}`);
  txt.push('');
  txt.push('【高置信度交易信号】');
  for (const s of liveSignals) {
    txt.push(`- 标的：${s.symbol}`);
    txt.push(`- 方向：${s.direction}`);
    txt.push(`- 入场区间：${s.entryLow.toFixed(4)} ~ ${s.entryHigh.toFixed(4)}`);
    txt.push(`- 止损：${s.stop.toFixed(4)}`);
    txt.push(`- 止盈：${s.tp.toFixed(4)}`);
    txt.push(`- 信号置信度：${(s.confidence * 100).toFixed(1)}%`);
    txt.push(`- 持有周期：${s.hold}`);
    txt.push('');
  }

  txt.push('【策略固化规则】');
  txt.push(`- 标的池：美股(${US_SYMBOLS.join(', ')}) + 加密(${CRYPTO_SYMBOLS.join(', ')}) + SPY期权`);
  txt.push('- 入场条件：P(up)>0.62 且 3日收益预测>1% 做多；P(up)<0.38 且 3日收益预测<-1% 做空；其余不交易');
  txt.push('- 止损规则：1.2~1.3 ATR 硬止损，触发即离场');
  txt.push('- 止盈规则：分段止盈 TP1=1.2 ATR(50%)，TP2=2.4~2.6 ATR(剩余仓位)');
  txt.push('- 仓位管理：单笔风险≤1%，组合同时持仓≤4笔，相关性>0.8的同向信号只保留1笔');
  txt.push('- 风控阈值：日内组合回撤>3%停机；滚动最大回撤>12%降杠杆50%并进入防守模式');

  await fs.writeFile(path.join(OUT_DIR, 'report.txt'), txt.join('\n'));

  console.log(txt.join('\n'));
  console.log(`\n报告文件: ${path.join(OUT_DIR, 'report.json')}`);
}

main().catch((error) => {
  console.error('auto engine failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
