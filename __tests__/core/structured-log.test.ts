import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("log", () => {
  it("writes JSON line to stderr", async () => {
    const { log } = await import("../../src/core/structured-log.js");
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    log("graph", { level: "info", msg: "upsert" });

    expect(errSpy).toHaveBeenCalledOnce();
    const output = errSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
    expect(parsed["domain"]).toBe("graph");
    expect(parsed["level"]).toBe("info");
    expect(parsed["msg"]).toBe("upsert");
  });

  it("includes ISO timestamp in every entry", async () => {
    const { log } = await import("../../src/core/structured-log.js");
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    log("test", { level: "debug", msg: "hello" });

    const output = errSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
    expect(parsed["ts"]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("includes extra fields from entry", async () => {
    const { log } = await import("../../src/core/structured-log.js");
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    log("push", { level: "warn", msg: "expired", slug: "acme-corp", eventsProcessed: 42 });

    const output = errSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
    expect(parsed["slug"]).toBe("acme-corp");
    expect(parsed["eventsProcessed"]).toBe(42);
  });

  it("does not throw on circular reference — uses safe stringify", async () => {
    const { log } = await import("../../src/core/structured-log.js");
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    expect(() =>
      log("test", { level: "error", msg: "circular", extra: circular as unknown as string })
    ).not.toThrow();
  });

  it("outputs newline-terminated JSON line", async () => {
    const { log } = await import("../../src/core/structured-log.js");
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    log("test", { level: "info", msg: "newline" });

    const output = errSpy.mock.calls[0]![0] as string;
    expect(output.endsWith("\n")).toBe(true);
  });
});

describe("withTimer", () => {
  it("logs entry with durationMs when done() is called", async () => {
    const { withTimer } = await import("../../src/core/structured-log.js");
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const done = withTimer("graph", "upsert", "acme-corp");
    await new Promise((r) => setTimeout(r, 5));
    done();

    expect(errSpy).toHaveBeenCalledOnce();
    const output = errSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
    expect(parsed["durationMs"]).toBeGreaterThanOrEqual(0);
    expect(parsed["slug"]).toBe("acme-corp");
    expect(parsed["msg"]).toBe("upsert");
    expect(parsed["domain"]).toBe("graph");
  });

  it("sets level to info by default", async () => {
    const { withTimer } = await import("../../src/core/structured-log.js");
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    withTimer("test", "some-op")();

    const output = errSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
    expect(parsed["level"]).toBe("info");
  });

  it("does not log before done() is called", async () => {
    const { withTimer } = await import("../../src/core/structured-log.js");
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    withTimer("test", "pending");

    expect(errSpy).not.toHaveBeenCalled();
  });

  it("works without optional slug parameter", async () => {
    const { withTimer } = await import("../../src/core/structured-log.js");
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    withTimer("test", "no-slug")();

    const output = errSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
    expect(parsed["slug"]).toBeUndefined();
  });
});

describe("log level filtering", () => {
  it("respects DXCRM_LOG_LEVEL env var — suppresses debug below info", async () => {
    process.env["DXCRM_LOG_LEVEL"] = "info";
    vi.resetModules();
    const { log } = await import("../../src/core/structured-log.js");
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    log("test", { level: "debug", msg: "suppressed" });
    expect(errSpy).not.toHaveBeenCalled();

    log("test", { level: "info", msg: "shown" });
    expect(errSpy).toHaveBeenCalledOnce();

    delete process.env["DXCRM_LOG_LEVEL"];
  });
});
