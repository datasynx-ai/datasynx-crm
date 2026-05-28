import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("guardString", () => {
  it("returns string value as-is", async () => {
    const { guardString } = await import("../../src/core/input-guard.js");
    expect(guardString("hello", "name")).toBe("hello");
  });

  it("throws when value is not a string", async () => {
    const { guardString } = await import("../../src/core/input-guard.js");
    expect(() => guardString(42, "name")).toThrow("name: expected string");
    expect(() => guardString(null, "name")).toThrow("name: expected string");
    expect(() => guardString(undefined, "name")).toThrow("name: expected string");
  });

  it("throws when string exceeds maxLen", async () => {
    const { guardString } = await import("../../src/core/input-guard.js");
    expect(() => guardString("a".repeat(101), "bio", { maxLen: 100 })).toThrow("bio: exceeds max length 100");
  });

  it("accepts string within maxLen", async () => {
    const { guardString } = await import("../../src/core/input-guard.js");
    expect(guardString("a".repeat(100), "bio", { maxLen: 100 })).toBe("a".repeat(100));
  });

  it("validates against pattern", async () => {
    const { guardString } = await import("../../src/core/input-guard.js");
    expect(() => guardString("not-a-date", "deadline", { pattern: /^\d{4}-\d{2}-\d{2}$/ })).toThrow("deadline: invalid format");
    expect(guardString("2026-09-30", "deadline", { pattern: /^\d{4}-\d{2}-\d{2}$/ })).toBe("2026-09-30");
  });

  it("trims whitespace by default", async () => {
    const { guardString } = await import("../../src/core/input-guard.js");
    expect(guardString("  hello  ", "name")).toBe("hello");
  });
});

describe("guardNumber", () => {
  it("returns number value as-is", async () => {
    const { guardNumber } = await import("../../src/core/input-guard.js");
    expect(guardNumber(42, "count")).toBe(42);
  });

  it("throws when value is not a finite number", async () => {
    const { guardNumber } = await import("../../src/core/input-guard.js");
    expect(() => guardNumber("42", "count")).toThrow("count: expected number");
    expect(() => guardNumber(NaN, "count")).toThrow("count: expected number");
    expect(() => guardNumber(Infinity, "count")).toThrow("count: expected number");
    expect(() => guardNumber(null, "count")).toThrow("count: expected number");
  });

  it("throws when number below min", async () => {
    const { guardNumber } = await import("../../src/core/input-guard.js");
    expect(() => guardNumber(-1, "iterations", { min: 0 })).toThrow("iterations: must be >= 0");
  });

  it("throws when number above max", async () => {
    const { guardNumber } = await import("../../src/core/input-guard.js");
    expect(() => guardNumber(100_001, "iterations", { max: 100_000 })).toThrow("iterations: must be <= 100000");
  });

  it("accepts value exactly at min and max boundaries", async () => {
    const { guardNumber } = await import("../../src/core/input-guard.js");
    expect(guardNumber(0, "n", { min: 0, max: 10 })).toBe(0);
    expect(guardNumber(10, "n", { min: 0, max: 10 })).toBe(10);
  });
});

describe("guardIsoDate", () => {
  it("accepts valid YYYY-MM-DD", async () => {
    const { guardIsoDate } = await import("../../src/core/input-guard.js");
    expect(guardIsoDate("2026-09-30", "deadline")).toBe("2026-09-30");
  });

  it("accepts valid ISO 8601 datetime", async () => {
    const { guardIsoDate } = await import("../../src/core/input-guard.js");
    expect(guardIsoDate("2026-09-30T00:00:00.000Z", "deadline")).toBe("2026-09-30T00:00:00.000Z");
  });

  it("throws on invalid date string", async () => {
    const { guardIsoDate } = await import("../../src/core/input-guard.js");
    expect(() => guardIsoDate("not-a-date", "deadline")).toThrow("deadline: invalid date");
    expect(() => guardIsoDate("2026-13-01", "deadline")).toThrow("deadline: invalid date");
    expect(() => guardIsoDate("", "deadline")).toThrow("deadline: invalid date");
  });

  it("throws on non-string input", async () => {
    const { guardIsoDate } = await import("../../src/core/input-guard.js");
    expect(() => guardIsoDate(null, "deadline")).toThrow("deadline: invalid date");
    expect(() => guardIsoDate(20260930, "deadline")).toThrow("deadline: invalid date");
  });

  it("rejects clearly past dates that are still parseable (remains valid — no business rule)", async () => {
    const { guardIsoDate } = await import("../../src/core/input-guard.js");
    // Past dates are valid ISO 8601; business rules enforced elsewhere
    expect(guardIsoDate("2000-01-01", "deadline")).toBe("2000-01-01");
  });
});

describe("guardLlmResponse", () => {
  it("returns response when within byte limit", async () => {
    const { guardLlmResponse } = await import("../../src/core/input-guard.js");
    const resp = '{"action":"suggest"}';
    expect(guardLlmResponse(resp, 1024)).toBe(resp);
  });

  it("throws when response exceeds maxBytes", async () => {
    const { guardLlmResponse } = await import("../../src/core/input-guard.js");
    const big = "x".repeat(513 * 1024); // 513KB
    expect(() => guardLlmResponse(big, 512 * 1024)).toThrow("LLM response exceeds 524288 bytes");
  });

  it("uses default limit of 512KB when maxBytes not specified", async () => {
    const { guardLlmResponse } = await import("../../src/core/input-guard.js");
    const fine = "x".repeat(512 * 1024 - 1);
    expect(guardLlmResponse(fine)).toBe(fine);
  });

  it("throws when response is not a string", async () => {
    const { guardLlmResponse } = await import("../../src/core/input-guard.js");
    expect(() => guardLlmResponse(null as unknown as string)).toThrow("LLM response: expected string");
  });
});

describe("guardPositiveInt", () => {
  it("accepts positive integers", async () => {
    const { guardPositiveInt } = await import("../../src/core/input-guard.js");
    expect(guardPositiveInt(1, "count")).toBe(1);
    expect(guardPositiveInt(100, "count")).toBe(100);
  });

  it("throws on zero", async () => {
    const { guardPositiveInt } = await import("../../src/core/input-guard.js");
    expect(() => guardPositiveInt(0, "count")).toThrow("count: must be >= 1");
  });

  it("throws on negative", async () => {
    const { guardPositiveInt } = await import("../../src/core/input-guard.js");
    expect(() => guardPositiveInt(-5, "count")).toThrow("count: must be >= 1");
  });

  it("throws on float", async () => {
    const { guardPositiveInt } = await import("../../src/core/input-guard.js");
    expect(() => guardPositiveInt(1.5, "count")).toThrow("count: must be integer");
  });
});
