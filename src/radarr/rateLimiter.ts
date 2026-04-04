export class RateLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitExceededError';
  }
}

export class RateLimiter {
  private active = 0;
  private hourlyCount = 0;
  private hourStart = Date.now();
  private waitQueue: Array<() => void> = [];

  constructor(
    private maxConcurrent: number,
    private delayBetweenMs: number,
    private maxPerHour: number,
  ) {}

  private resetHourlyIfNeeded(): void {
    if (Date.now() - this.hourStart >= 3_600_000) {
      this.hourlyCount = 0;
      this.hourStart = Date.now();
    }
  }

  private async acquire(): Promise<void> {
    this.resetHourlyIfNeeded();

    if (this.hourlyCount >= this.maxPerHour) {
      throw new RateLimitExceededError(`Hourly cap of ${this.maxPerHour} reached`);
    }

    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.waitQueue.push(resolve));
    }

    this.active++;
    this.hourlyCount++;

    if (this.delayBetweenMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayBetweenMs));
    }
  }

  private release(): void {
    this.active--;
    const next = this.waitQueue.shift();
    if (next) next();
  }

  async withLimit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  getStatus(): { active: number; hourlyCount: number; maxPerHour: number } {
    this.resetHourlyIfNeeded();
    return { active: this.active, hourlyCount: this.hourlyCount, maxPerHour: this.maxPerHour };
  }
}
