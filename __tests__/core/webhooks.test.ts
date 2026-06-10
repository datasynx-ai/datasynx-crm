import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vol.reset();
  vi.resetModules();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const DATA_DIR = "/crm";
async function mod() {
  return import("../../src/core/webhooks.js");
}

describe("webhook subscriptions", () => {
  it("adds, lists and removes subscriptions", async () => {
    const { addWebhook, loadWebhooks, removeWebhook } = await mod();
    const sub = addWebhook(DATA_DIR, "https://hooks.example.com/x", ["record.created"], "s3cr3t");
    expect(sub.id).toBeTruthy();
    expect(loadWebhooks(DATA_DIR)).toHaveLength(1);
    expect(removeWebhook(DATA_DIR, sub.id)).toBe(true);
    expect(loadWebhooks(DATA_DIR)).toHaveLength(0);
  });

  it("matches events exactly and via wildcard", async () => {
    const { matchSubscriptions } = await mod();
    const subs = [
      { id: "1", url: "u1", events: ["record.created"], createdAt: "" },
      { id: "2", url: "u2", events: ["record.*"], createdAt: "" },
      { id: "3", url: "u3", events: ["*"], createdAt: "" },
      { id: "4", url: "u4", events: ["deal.updated"], createdAt: "" },
    ];
    const m = matchSubscriptions(subs, "record.created").map((s) => s.id);
    expect(m).toEqual(["1", "2", "3"]);
  });

  it("signPayload is deterministic HMAC hex", async () => {
    const { signPayload } = await mod();
    expect(signPayload("k", "body")).toBe(signPayload("k", "body"));
    expect(signPayload("k", "body")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("emitEvent + retryFailures", () => {
  beforeEach(async () => {
    const { addWebhook } = await mod();
    addWebhook(DATA_DIR, "https://hooks.example.com/x", ["record.created"], "s3cr3t");
  });

  it("delivers to matching subscriptions and queues nothing on success", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const { emitEvent, loadFailures } = await mod();
    await emitEvent(DATA_DIR, "record.created", { id: "r1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    expect((call[1] as { headers: Record<string, string> }).headers["X-DXCRM-Event"]).toBe(
      "record.created"
    );
    expect(loadFailures(DATA_DIR)).toHaveLength(0);
  });

  it("queues a failure when delivery fails, and retryFailures clears it on success", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const { emitEvent, loadFailures, retryFailures } = await mod();
    await emitEvent(DATA_DIR, "record.created", { id: "r1" });
    expect(loadFailures(DATA_DIR)).toHaveLength(1);

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    const res = await retryFailures(DATA_DIR);
    expect(res.retried).toBe(1);
    expect(loadFailures(DATA_DIR)).toHaveLength(0);
  });

  it("does not deliver to non-matching events", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const { emitEvent } = await mod();
    await emitEvent(DATA_DIR, "deal.updated", { id: "d1" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("delivery failures (#69)", () => {
  it("queues a failure when the endpoint answers non-2xx", async () => {
    const { addWebhook, emitEvent, loadFailures } = await mod();
    addWebhook(DATA_DIR, "https://hooks.example.com/x", ["deal.updated"]);
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await emitEvent(DATA_DIR, "deal.updated", { slug: "acme" });
    const failures = loadFailures(DATA_DIR);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.lastError).toBe("HTTP 500");
  });

  it("keeps still-failing deliveries in the retry queue with attempts+1", async () => {
    const { addWebhook, emitEvent, retryFailures, loadFailures } = await mod();
    addWebhook(DATA_DIR, "https://hooks.example.com/x", ["deal.updated"]);
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    await emitEvent(DATA_DIR, "deal.updated", { slug: "acme" });
    const before = loadFailures(DATA_DIR)[0]!;

    const result = await retryFailures(DATA_DIR);
    expect(result).toEqual({ retried: 0, stillFailing: 1 });
    const after = loadFailures(DATA_DIR)[0]!;
    expect(after.attempts).toBe(before.attempts + 1);
    expect(after.lastError).toBe("HTTP 503");
  });
});
