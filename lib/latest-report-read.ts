/** One report read at a time. Superseded queued selections never reach the server.
 * Running reads finish instead of abort/retry loops that leave SQL running remotely.
 * No completed financial data is cached. Each settled selection reads fresh data.
 */
export class LatestReportRead {
  private running = false;
  private pending?: { run: () => Promise<unknown>; resolve: (value: any) => void; reject: (error: unknown) => void };
  private timer?: ReturnType<typeof setTimeout>;

  read<T>(run: () => Promise<T>): Promise<T> {
    this.cancelPending();
    const result = new Promise<T>((resolve, reject) => { this.pending = { run, resolve, reject }; });
    this.timer = setTimeout(() => { this.timer = undefined; void this.drain(); }, 180);
    return result;
  }

  cancelPending() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending?.reject(new DOMException("Selection superseded", "AbortError"));
    this.pending = undefined;
  }

  private async drain() {
    if (this.running || this.timer || !this.pending) return;
    const next = this.pending;
    this.pending = undefined;
    this.running = true;
    try { next.resolve(await next.run()); } catch (error) { next.reject(error); }
    finally { this.running = false; void this.drain(); }
  }
}
