import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export function readConfig(env = process.env) {
  let origin;
  try { origin = new URL(env.PRINT_DISPATCH_ORIGIN); }
  catch { throw new Error("PRINT_DISPATCH_ORIGIN must be an HTTPS root URL"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if ((origin.protocol !== "https:" && !(local && origin.protocol === "http:")) ||
      origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("PRINT_DISPATCH_ORIGIN must be an HTTPS root URL (HTTP only on loopback)");
  }
  if (!env.PRINT_WORKER_KEY || /[\r\n]/.test(env.PRINT_WORKER_KEY)) {
    throw new Error("PRINT_WORKER_KEY is required and must not contain newlines");
  }
  return { endpoint: new URL("/api/print/dispatch", origin).href, key: env.PRINT_WORKER_KEY };
}

export class DispatchError extends Error {
  constructor(message, fatal = false) { super(message); this.fatal = fatal; }
}

export async function dispatchOnce(config, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-print-worker-key": config.key },
      // One job per request avoids ageing the rest of a sequential batch's lease.
      body: JSON.stringify({ limit: 1 }),
      redirect: "error",
      signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new DispatchError(`dispatch HTTP ${response.status}`, [401, 403, 404].includes(response.status));
    }
    const result = await response.json();
    if (!result || !["picked", "printed", "failed"].every(k => Number.isInteger(result[k]) && result[k] >= 0) ||
        result.picked > 1 || result.printed + result.failed !== result.picked) {
      throw new DispatchError("invalid dispatch response");
    }
    return { picked: result.picked, printed: result.printed, failed: result.failed };
  } catch (error) {
    if (error instanceof DispatchError) throw error;
    // Never log fetch errors/bodies: they can include URLs or server/provider details.
    throw new DispatchError("dispatch transport/response error; outcome may be unknown");
  }
}

export async function runDispatcher(config, {
  signal, dispatch = dispatchOnce, sleep = delay, log = console.log, now = Date.now
} = {}) {
  const wait = async ms => {
    try { await sleep(ms, undefined, { signal }); }
    catch (error) { if (!signal?.aborted) throw error; }
  };
  // A replaced process may still have a server request in progress.
  log("print dispatcher starting; waiting 60s before polling");
  await wait(60_000);
  let heartbeat = now();
  while (!signal?.aborted) {
    let pause = 1_000;
    try {
      const result = await dispatch(config);
      if (result.picked || now() - heartbeat >= 60_000) {
        log(`print dispatcher picked=${result.picked} printed=${result.printed} failed=${result.failed}`);
        heartbeat = now();
      }
    } catch (error) {
      if (error instanceof DispatchError && error.fatal) throw error;
      log("print dispatcher request failed; waiting 60s; check backend and print health");
      pause = 60_000;
    }
    // Await completion before the next call; never overlap polling requests.
    if (!signal?.aborted) await wait(pause);
  }
  log("print dispatcher stopped");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try { await runDispatcher(readConfig(), { signal: controller.signal }); }
  catch (error) {
    console.error(error instanceof DispatchError || error?.message?.startsWith("PRINT_")
      ? error.message : "print dispatcher failed");
    process.exitCode = 1;
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}
