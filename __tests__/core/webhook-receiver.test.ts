import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "crypto";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function makeHmac(secret: string, payload: Buffer): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

describe("verifyHmacSha256", () => {
  it("returns true for correct signature", async () => {
    const { verifyHmacSha256 } = await import("../../src/core/webhook-receiver.js");
    const secret = "my-secret";
    const payload = Buffer.from("hello world");
    const sig = makeHmac(secret, payload);
    expect(verifyHmacSha256(secret, payload, sig)).toBe(true);
  });

  it("returns false for wrong signature", async () => {
    const { verifyHmacSha256 } = await import("../../src/core/webhook-receiver.js");
    const payload = Buffer.from("hello world");
    expect(verifyHmacSha256("my-secret", payload, "sha256=deadbeef")).toBe(false);
  });

  it("returns false for tampered payload", async () => {
    const { verifyHmacSha256 } = await import("../../src/core/webhook-receiver.js");
    const secret = "my-secret";
    const original = Buffer.from("hello world");
    const sig = makeHmac(secret, original);
    const tampered = Buffer.from("hello TAMPERED");
    expect(verifyHmacSha256(secret, tampered, sig)).toBe(false);
  });

  it("returns false when signature missing sha256= prefix", async () => {
    const { verifyHmacSha256 } = await import("../../src/core/webhook-receiver.js");
    const payload = Buffer.from("hello");
    expect(verifyHmacSha256("secret", payload, "deadbeef")).toBe(false);
  });
});

describe("verifyStripeSignature", () => {
  it("returns true for valid stripe signature", async () => {
    const { verifyStripeSignature } = await import("../../src/core/webhook-receiver.js");
    const secret = "stripe-secret";
    const rawBody = Buffer.from('{"type":"payment.created"}');
    const t = "1234567890";
    const signedPayload = `${t}.${rawBody.toString()}`;
    const v1 = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
    const header = `t=${t},v1=${v1}`;
    expect(verifyStripeSignature(secret, rawBody, header)).toBe(true);
  });

  it("returns false for invalid stripe signature", async () => {
    const { verifyStripeSignature } = await import("../../src/core/webhook-receiver.js");
    const rawBody = Buffer.from('{"type":"payment.created"}');
    expect(verifyStripeSignature("stripe-secret", rawBody, "t=123,v1=badbadbad")).toBe(false);
  });
});

describe("WebhookQueue", () => {
  it("enqueue calls handler.handle with the payload", async () => {
    const { WebhookQueue } = await import("../../src/core/webhook-receiver.js");
    const queue = new WebhookQueue();
    const handled: unknown[] = [];
    const handler = {
      provider: "test",
      handle: async (payload: unknown) => {
        handled.push(payload);
      },
    };
    queue.enqueue(handler, { event: "ping" });
    await new Promise((r) => setTimeout(r, 20));
    expect(handled).toHaveLength(1);
    expect(handled[0]).toEqual({ event: "ping" });
  });

  it("continues processing next item when a handler throws", async () => {
    const { WebhookQueue } = await import("../../src/core/webhook-receiver.js");
    const queue = new WebhookQueue();
    const results: string[] = [];
    const throwingHandler = {
      provider: "bad",
      handle: async (_payload: unknown) => {
        throw new Error("handler boom");
      },
    };
    const goodHandler = {
      provider: "good",
      handle: async (_payload: unknown) => {
        results.push("good");
      },
    };
    queue.enqueue(throwingHandler, {});
    queue.enqueue(goodHandler, {});
    await new Promise((r) => setTimeout(r, 50));
    expect(results).toContain("good");
  });

  it("pendingCount decrements after processing", async () => {
    const { WebhookQueue } = await import("../../src/core/webhook-receiver.js");
    const queue = new WebhookQueue();
    // Enqueue many items without draining (use a slow handler to check pending)
    let resolveFirst: (() => void) | undefined;
    const slowHandler = {
      provider: "slow",
      handle: async (_payload: unknown) => {
        await new Promise<void>((r) => { resolveFirst = r; });
      },
    };
    const fastHandler = {
      provider: "fast",
      handle: async (_payload: unknown) => { /* no-op */ },
    };
    queue.enqueue(slowHandler, {});
    queue.enqueue(fastHandler, {});
    queue.enqueue(fastHandler, {});
    // pendingCount is items still in the queue (not yet being processed)
    // The slow handler is being processed, so pending = 2
    expect(queue.pendingCount).toBe(2);
    resolveFirst?.();
    await new Promise((r) => setTimeout(r, 50));
    expect(queue.pendingCount).toBe(0);
  });
});

describe("PROVIDER_SIGNATURE_HEADERS", () => {
  it("maps known providers to correct header names", async () => {
    const { PROVIDER_SIGNATURE_HEADERS } = await import("../../src/core/webhook-receiver.js");
    expect(PROVIDER_SIGNATURE_HEADERS["github"]).toBe("x-hub-signature-256");
    expect(PROVIDER_SIGNATURE_HEADERS["stripe"]).toBe("stripe-signature");
    expect(PROVIDER_SIGNATURE_HEADERS["hubspot"]).toBe("x-hubspot-signature-v3");
    expect(PROVIDER_SIGNATURE_HEADERS["linear"]).toBe("linear-signature");
  });
});
