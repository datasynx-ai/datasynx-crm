import { describe, it, expect } from "vitest";
import { createRateLimiter, clientIp } from "../../src/core/http-guard.js";

describe("createRateLimiter (#61)", () => {
  it("allows up to max hits within the window, then blocks", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    const t = 1_000_000;
    expect(limiter.limited("a", t)).toBe(false);
    expect(limiter.limited("a", t + 1)).toBe(false);
    expect(limiter.limited("a", t + 2)).toBe(false);
    expect(limiter.limited("a", t + 3)).toBe(true);
  });

  it("slides the window: old hits expire", () => {
    const limiter = createRateLimiter({ windowMs: 1_000, max: 2 });
    const t = 1_000_000;
    expect(limiter.limited("a", t)).toBe(false);
    expect(limiter.limited("a", t + 100)).toBe(false);
    expect(limiter.limited("a", t + 200)).toBe(true);
    // first hit has left the window — one slot is free again
    expect(limiter.limited("a", t + 1_050)).toBe(false);
    expect(limiter.limited("a", t + 1_060)).toBe(true);
  });

  it("isolates keys from each other", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    const t = 1_000_000;
    expect(limiter.limited("a", t)).toBe(false);
    expect(limiter.limited("b", t)).toBe(false);
    expect(limiter.limited("a", t + 1)).toBe(true);
    expect(limiter.limited("b", t + 1)).toBe(true);
  });

  it("reset() clears all state", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    const t = 1_000_000;
    expect(limiter.limited("a", t)).toBe(false);
    expect(limiter.limited("a", t + 1)).toBe(true);
    limiter.reset();
    expect(limiter.limited("a", t + 2)).toBe(false);
  });
});

describe("clientIp (#61)", () => {
  it("prefers the first x-forwarded-for hop", () => {
    expect(
      clientIp({
        headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
        socket: { remoteAddress: "127.0.0.1" },
      })
    ).toBe("203.0.113.7");
  });

  it("falls back to socket.remoteAddress", () => {
    expect(clientIp({ headers: {}, socket: { remoteAddress: "192.0.2.4" } })).toBe("192.0.2.4");
  });

  it("returns 'unknown' when nothing is available", () => {
    expect(clientIp({ headers: {} })).toBe("unknown");
  });
});
