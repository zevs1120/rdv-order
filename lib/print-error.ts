export class PrintDispatchError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean, readonly outcome: "unknown" | "offline" | "rejected" = "rejected") {
    super(message);
    this.retryable = retryable;
  }
}
