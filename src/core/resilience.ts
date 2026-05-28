export interface RetryOptions {
  attempts: number;
  backoffMs: number;
  maxBackoffMs?: number;
  shouldRetry?: (err: Error) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const { attempts, backoffMs, maxBackoffMs, shouldRetry } = opts;
  let lastError!: Error;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (shouldRetry && !shouldRetry(lastError)) throw lastError;
      if (attempt < attempts - 1) {
        const delay = maxBackoffMs
          ? Math.min(backoffMs * 2 ** attempt, maxBackoffMs)
          : backoffMs * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  threshold: number;
  timeoutMs: number;
  halfOpenAfter: number;
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private _state: CircuitState = "closed";

  constructor(private readonly opts: CircuitBreakerOptions) {}

  get state(): CircuitState {
    return this._state;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this._state === "open") {
      const elapsed = Date.now() - (this.openedAt ?? 0);
      if (elapsed >= this.opts.halfOpenAfter) {
        this._state = "half-open";
      } else {
        throw new Error("Circuit open");
      }
    }

    try {
      const result = await fn();
      // Success — reset
      this.failures = 0;
      this._state = "closed";
      this.openedAt = null;
      return result;
    } catch (err) {
      this.failures++;
      if (this._state === "half-open" || this.failures >= this.opts.threshold) {
        this._state = "open";
        this.openedAt = Date.now();
        this.failures = 0;
      }
      throw err;
    }
  }
}
