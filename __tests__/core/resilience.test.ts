import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("withRetry", () => {
  it("returns result on first successful call", async () => {
    const { withRetry } = await import("../../src/core/resilience.js");
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { attempts: 3, backoffMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("retries on failure and succeeds on second attempt", async () => {
    const { withRetry } = await import("../../src/core/resilience.js");
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, { attempts: 3, backoffMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting all attempts", async () => {
    const { withRetry } = await import("../../src/core/resilience.js");
    const fn = vi.fn().mockRejectedValue(new Error("permanent failure"));
    await expect(withRetry(fn, { attempts: 3, backoffMs: 1 })).rejects.toThrow("permanent failure");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("uses shouldRetry predicate to skip non-retryable errors", async () => {
    const { withRetry } = await import("../../src/core/resilience.js");
    const fn = vi.fn().mockRejectedValue(new Error("auth_failed"));
    const shouldRetry = (err: Error) => err.message.includes("transient");
    await expect(withRetry(fn, { attempts: 5, backoffMs: 1, shouldRetry })).rejects.toThrow("auth_failed");
    // Should not retry at all since shouldRetry returns false
    expect(fn).toHaveBeenCalledOnce();
  });

  it("retries only when shouldRetry returns true", async () => {
    const { withRetry } = await import("../../src/core/resilience.js");
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("rate_limit"))
      .mockResolvedValue("ok");
    const shouldRetry = (err: Error) => err.message.includes("rate_limit");
    const result = await withRetry(fn, { attempts: 3, backoffMs: 1, shouldRetry });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("applies exponential backoff between attempts", async () => {
    const { withRetry } = await import("../../src/core/resilience.js");
    const delays: number[] = [];
    const real = globalThis.setTimeout.bind(globalThis);
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn, ms) => {
      delays.push(ms as number);
      return real(fn as () => void, 0);
    });

    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    await withRetry(fn, { attempts: 3, backoffMs: 100 });
    expect(delays[0]).toBe(100);
    expect(delays[1]).toBe(200);
    vi.restoreAllMocks();
  });

  it("caps backoff at maxBackoffMs", async () => {
    const { withRetry } = await import("../../src/core/resilience.js");
    const delays: number[] = [];
    const real = globalThis.setTimeout.bind(globalThis);
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn, ms) => {
      delays.push(ms as number);
      return real(fn as () => void, 0);
    });

    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("b"))
      .mockRejectedValueOnce(new Error("c"))
      .mockResolvedValue("ok");

    await withRetry(fn, { attempts: 4, backoffMs: 100, maxBackoffMs: 150 });
    expect(Math.max(...delays)).toBeLessThanOrEqual(150);
    vi.restoreAllMocks();
  });
});

describe("CircuitBreaker", () => {
  it("passes through calls when closed", async () => {
    const { CircuitBreaker } = await import("../../src/core/resilience.js");
    const cb = new CircuitBreaker({ threshold: 3, timeoutMs: 100, halfOpenAfter: 50 });
    const result = await cb.call(async () => "ok");
    expect(result).toBe("ok");
  });

  it("opens after threshold consecutive failures", async () => {
    const { CircuitBreaker } = await import("../../src/core/resilience.js");
    const cb = new CircuitBreaker({ threshold: 3, timeoutMs: 100, halfOpenAfter: 50 });
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    for (let i = 0; i < 3; i++) {
      await expect(cb.call(fn)).rejects.toThrow();
    }

    // Now circuit is open — should fail immediately without calling fn
    await expect(cb.call(fn)).rejects.toThrow("Circuit open");
    expect(fn).toHaveBeenCalledTimes(3); // not 4
  });

  it("rejects immediately when open without calling fn", async () => {
    const { CircuitBreaker } = await import("../../src/core/resilience.js");
    const cb = new CircuitBreaker({ threshold: 2, timeoutMs: 100, halfOpenAfter: 10 });
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    await expect(cb.call(fn)).rejects.toThrow();
    await expect(cb.call(fn)).rejects.toThrow();

    const fastFail = vi.fn().mockResolvedValue("unreachable");
    await expect(cb.call(fastFail)).rejects.toThrow("Circuit open");
    expect(fastFail).not.toHaveBeenCalled();
  });

  it("transitions to half-open after halfOpenAfter ms", async () => {
    const { CircuitBreaker } = await import("../../src/core/resilience.js");
    const cb = new CircuitBreaker({ threshold: 2, timeoutMs: 100, halfOpenAfter: 20 });
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    await expect(cb.call(fn)).rejects.toThrow();
    await expect(cb.call(fn)).rejects.toThrow();

    // Wait for half-open window
    await new Promise((r) => setTimeout(r, 30));

    // In half-open, one probe call is allowed
    const probe = vi.fn().mockResolvedValue("recovered");
    const result = await cb.call(probe);
    expect(result).toBe("recovered");
    expect(probe).toHaveBeenCalledOnce();
  });

  it("closes circuit on successful half-open probe", async () => {
    const { CircuitBreaker } = await import("../../src/core/resilience.js");
    const cb = new CircuitBreaker({ threshold: 2, timeoutMs: 100, halfOpenAfter: 20 });
    const failFn = vi.fn().mockRejectedValue(new Error("fail"));

    await expect(cb.call(failFn)).rejects.toThrow();
    await expect(cb.call(failFn)).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 30));

    await cb.call(vi.fn().mockResolvedValue("ok")); // probe succeeds
    // Circuit should now be closed again
    const normalCall = vi.fn().mockResolvedValue("normal");
    await cb.call(normalCall);
    expect(normalCall).toHaveBeenCalledOnce();
  });

  it("re-opens on failed half-open probe", async () => {
    const { CircuitBreaker } = await import("../../src/core/resilience.js");
    const cb = new CircuitBreaker({ threshold: 2, timeoutMs: 100, halfOpenAfter: 20 });
    const failFn = vi.fn().mockRejectedValue(new Error("fail"));

    await expect(cb.call(failFn)).rejects.toThrow();
    await expect(cb.call(failFn)).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 30));

    // probe also fails
    await expect(cb.call(vi.fn().mockRejectedValue(new Error("still failing")))).rejects.toThrow();

    // Should be open again
    const blocked = vi.fn().mockResolvedValue("unreachable");
    await expect(cb.call(blocked)).rejects.toThrow("Circuit open");
    expect(blocked).not.toHaveBeenCalled();
  });

  it("resets failure count on success", async () => {
    const { CircuitBreaker } = await import("../../src/core/resilience.js");
    const cb = new CircuitBreaker({ threshold: 3, timeoutMs: 100, halfOpenAfter: 50 });
    const fail = vi.fn().mockRejectedValue(new Error("fail"));
    const ok = vi.fn().mockResolvedValue("ok");

    // 2 failures (threshold = 3)
    await expect(cb.call(fail)).rejects.toThrow();
    await expect(cb.call(fail)).rejects.toThrow();
    // Then success — resets failure count
    await cb.call(ok);
    // 2 more failures — should NOT open (count reset to 0 after success)
    await expect(cb.call(fail)).rejects.toThrow();
    await expect(cb.call(fail)).rejects.toThrow();
    // Still not open (only 2 consecutive failures since last success)
    const notBlocked = vi.fn().mockResolvedValue("ok");
    await cb.call(notBlocked);
    expect(notBlocked).toHaveBeenCalledOnce();
  });

  it("exposes state as closed | open | half-open", async () => {
    const { CircuitBreaker } = await import("../../src/core/resilience.js");
    const cb = new CircuitBreaker({ threshold: 2, timeoutMs: 100, halfOpenAfter: 20 });
    expect(cb.state).toBe("closed");

    const fail = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(cb.call(fail)).rejects.toThrow();
    await expect(cb.call(fail)).rejects.toThrow();
    expect(cb.state).toBe("open");

    await new Promise((r) => setTimeout(r, 30));
    // Next call triggers half-open probe
    const probe = vi.fn().mockResolvedValue("ok");
    await cb.call(probe);
    expect(cb.state).toBe("closed");
  });
});
