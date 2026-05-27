import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../../src/core/rate-limiter.js";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RateLimiter", () => {
  it("succeeds on first try", async () => {
    const limiter = new RateLimiter({ maxRetries: 3, baseDelayMs: 10 });
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await limiter.execute(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and eventually succeeds", async () => {
    const limiter = new RateLimiter({ maxRetries: 3, baseDelayMs: 1 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("success");
    const result = await limiter.execute(fn);
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after maxRetries exhausted", async () => {
    const limiter = new RateLimiter({ maxRetries: 2, baseDelayMs: 1 });
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(limiter.execute(fn)).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("applies exponential backoff delays", async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockRejectedValueOnce(new Error("fail 3"))
      .mockResolvedValue("done");

    const promise = limiter.execute(fn);

    // Advance timers for each retry: 1000, 2000, 4000
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);

    const result = await promise;
    expect(result).toBe("done");
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("caps delay at maxDelayMs", async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ maxRetries: 3, baseDelayMs: 10000, maxDelayMs: 5000 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    const promise = limiter.execute(fn);
    // delay should be min(10000*2^0, 5000) = 5000
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;
    expect(result).toBe("ok");
  });
});

describe("RateLimiter.isRateLimitError", () => {
  it("returns true for 429 messages", () => {
    expect(RateLimiter.isRateLimitError(new Error("HTTP 429 Too Many Requests"))).toBe(true);
  });

  it("returns true for rate limit messages", () => {
    expect(RateLimiter.isRateLimitError(new Error("rate limit exceeded"))).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(RateLimiter.isRateLimitError(new Error("500 Internal Server Error"))).toBe(false);
    expect(RateLimiter.isRateLimitError(new Error("Connection refused"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(RateLimiter.isRateLimitError("some string")).toBe(false);
    expect(RateLimiter.isRateLimitError(null)).toBe(false);
    expect(RateLimiter.isRateLimitError(429)).toBe(false);
  });
});
