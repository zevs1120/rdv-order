export type PrintProvider = "cloud" | "agent";

export async function dispatchPrintJob(orderId: string) {
  const provider = (process.env.PRINT_PROVIDER || "cloud") as PrintProvider;
  if (provider === "cloud") {
    // TODO: call cloud printer API
    return { queued: true, provider };
  }
  // TODO: push to local agent via websocket/queue
  return { queued: true, provider };
}
