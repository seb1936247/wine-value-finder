export class RateLimiter {
  private queue: Array<() => void> = [];
  private lastCall = 0;
  private minIntervalMs: number;

  constructor(opts: { requestsPerSecond: number }) {
    this.minIntervalMs = 1000 / opts.requestsPerSecond;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCall;
    if (elapsed < this.minIntervalMs) {
      await new Promise(resolve => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastCall = Date.now();
  }
}
