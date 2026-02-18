function parseProvider(raw, fallback) {
  const v = String(raw || "").toLowerCase();
  if (v === "cloud" || v === "agent") return v;
  return fallback;
}

function checkProvider(provider) {
  if (provider === "cloud") {
    return {
      provider,
      url: Boolean(process.env.PRINT_CLOUD_URL),
      token: Boolean(process.env.PRINT_CLOUD_API_KEY)
    };
  }
  return {
    provider,
    url: Boolean(process.env.PRINT_AGENT_URL),
    token: Boolean(process.env.PRINT_AGENT_TOKEN)
  };
}

function run() {
  const primary = parseProvider(process.env.PRINT_PROVIDER, "cloud");
  const fallbackRaw = process.env.PRINT_FALLBACK_PROVIDER;
  const fallback = fallbackRaw ? parseProvider(fallbackRaw, primary) : null;

  const primaryStatus = checkProvider(primary);
  const fallbackStatus = fallback && fallback !== primary ? checkProvider(fallback) : null;
  const workerKey = Boolean(process.env.PRINT_WORKER_KEY);
  const heartbeatKey = Boolean(process.env.DEVICE_HEARTBEAT_KEY);
  const timeoutMs = Number(process.env.PRINT_TIMEOUT_MS || 3000);
  const maxRetry = Number(process.env.PRINT_MAX_RETRY || 8);
  const alertFailCount = Number(process.env.PRINT_ALERT_FAIL_COUNT || 3);
  const alertQueueFailed = Number(process.env.PRINT_ALERT_QUEUE_FAILED || 3);
  const routeBarCategories = String(process.env.PRINT_ROUTE_BAR_CATEGORIES || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const routeBarKeywords = String(process.env.PRINT_ROUTE_BAR_KEYWORDS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const problems = [];
  if (!primaryStatus.url || !primaryStatus.token) {
    problems.push(`primary provider ${primaryStatus.provider} config incomplete`);
  }
  if (fallbackStatus && (!fallbackStatus.url || !fallbackStatus.token)) {
    problems.push(`fallback provider ${fallbackStatus.provider} config incomplete`);
  }
  if (!workerKey) {
    problems.push("PRINT_WORKER_KEY is not set");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 500) {
    problems.push("PRINT_TIMEOUT_MS should be >= 500");
  }
  if (!Number.isFinite(maxRetry) || maxRetry < 1) {
    problems.push("PRINT_MAX_RETRY should be >= 1");
  }
  if (!Number.isFinite(alertFailCount) || alertFailCount < 1) {
    problems.push("PRINT_ALERT_FAIL_COUNT should be >= 1");
  }
  if (!Number.isFinite(alertQueueFailed) || alertQueueFailed < 1) {
    problems.push("PRINT_ALERT_QUEUE_FAILED should be >= 1");
  }

  const output = {
    primary: primaryStatus,
    fallback: fallbackStatus,
    workerKey,
    heartbeatKey,
    timeoutMs,
    maxRetry,
    alertFailCount,
    alertQueueFailed,
    routeBarCategories,
    routeBarKeywords,
    ok: problems.length === 0,
    problems
  };
  console.log(JSON.stringify(output, null, 2));

  if (problems.length > 0) {
    process.exitCode = 1;
  }
}

run();
