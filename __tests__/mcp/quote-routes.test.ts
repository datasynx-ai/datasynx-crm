import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Quote } from "../../src/schemas/quote.js";

const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

const DATA_DIR = "/data";

let server: Server;
let base: string;
const envBackup: Record<string, string | undefined> = {};
const ENV_KEYS = ["STRIPE_WEBHOOK_SECRET", "DXCRM_QUOTE_SECRET"];

beforeEach(async () => {
  vol.reset();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  vol.mkdirSync(`${DATA_DIR}/.agentic/quotes`, { recursive: true });
  for (const k of ENV_KEYS) {
    envBackup[k] = process.env[k];
    delete process.env[k];
  }

  const { registerQuoteRoutes } = await import("../../src/mcp/routes/quote-routes.js");
  const { default: express } = await import("express");
  const app = express();
  // Mirror startHttp(): global JSON parsing with the raw body preserved for
  // signature-verified webhooks (Stripe signs the exact bytes).
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: string }).rawBody = buf.toString("utf-8");
      },
    })
  );
  registerQuoteRoutes(app, DATA_DIR);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function seedQuote(overrides: Partial<Quote> = {}): Quote {
  const quote: Quote = {
    quoteNumber: "Q-2026-001",
    slug: "acme",
    dealName: "ACME Corp",
    lineItems: [{ description: "Consulting", quantity: 2, unitPrice: 500, total: 1000 }],
    subtotal: 1000,
    vatPercent: 19,
    vat: 190,
    total: 1190,
    currency: "EUR",
    createdAt: "2026-06-01T00:00:00.000Z",
    validUntilDays: 30,
    validUntil: "2026-07-01",
    status: "sent",
    ...overrides,
  };
  vol.writeFileSync(
    `${DATA_DIR}/.agentic/quotes/${quote.quoteNumber}.json`,
    JSON.stringify(quote, null, 2)
  );
  return quote;
}

function readQuoteFile(quoteNumber = "Q-2026-001"): Quote {
  return JSON.parse(
    vol.readFileSync(`${DATA_DIR}/.agentic/quotes/${quoteNumber}.json`, "utf-8") as string
  ) as Quote;
}

async function signToken(payload: { q: string; s: string; exp: number }): Promise<string> {
  const { signQuoteToken } = await import("../../src/core/quote-link.js");
  return signQuoteToken(payload);
}

function validPayload() {
  return { q: "Q-2026-001", s: "acme", exp: Date.now() + 86_400_000 };
}

function postForm(path: string, fields: Record<string, string>): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("GET /q/:token (#68)", () => {
  it("rejects a garbage token with 400 and reveals nothing", async () => {
    seedQuote();
    const res = await fetch(`${base}/q/garbage`);
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("Q-2026-001");
  });

  it("rejects an expired token with 400", async () => {
    seedQuote();
    const token = await signToken({ q: "Q-2026-001", s: "acme", exp: Date.now() - 1000 });
    const res = await fetch(`${base}/q/${token}`);
    expect(res.status).toBe(400);
  });

  it("rejects a tampered token with 400", async () => {
    seedQuote();
    const token = await signToken(validPayload());
    // Flip a character in the signature part.
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    const res = await fetch(`${base}/q/${tampered}`);
    expect(res.status).toBe(400);
  });

  it("404s when the quote does not exist", async () => {
    const token = await signToken(validPayload());
    const res = await fetch(`${base}/q/${token}`);
    expect(res.status).toBe(404);
  });

  it("404s when the token slug does not match the quote", async () => {
    seedQuote({ slug: "other-customer" });
    const token = await signToken(validPayload());
    const res = await fetch(`${base}/q/${token}`);
    expect(res.status).toBe(404);
  });

  it("renders the quote and marks sent → viewed", async () => {
    seedQuote();
    const token = await signToken(validPayload());
    const res = await fetch(`${base}/q/${token}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Q-2026-001");
    expect(html).toContain("Accept quote");
    expect(readQuoteFile().status).toBe("viewed");
  });
});

describe("POST /q/:token/accept (#68)", () => {
  it("requires a name", async () => {
    seedQuote();
    const token = await signToken(validPayload());
    const res = await postForm(`/q/${token}/accept`, { name: "   " });
    expect(res.status).toBe(400);
    expect(readQuoteFile().status).toBe("sent");
  });

  it("rejects an invalid token with 400", async () => {
    seedQuote();
    const res = await postForm("/q/garbage/accept", { name: "Jane" });
    expect(res.status).toBe(400);
  });

  it("accepts the quote: status, signed receipt, quote.accepted event", async () => {
    seedQuote();
    const token = await signToken(validPayload());
    const res = await fetch(`${base}/q/${token}/accept`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      },
      body: new URLSearchParams({ name: "Jane Doe" }).toString(),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("accepted");

    const updated = readQuoteFile();
    expect(updated.status).toBe("accepted");
    expect(updated.signature?.name).toBe("Jane Doe");
    expect(updated.signature?.ip).toBe("203.0.113.9");

    const receipt = JSON.parse(
      vol.readFileSync(`${DATA_DIR}/.agentic/quotes/Q-2026-001.receipt.json`, "utf-8") as string
    ) as { quoteNumber: string; name: string };
    expect(receipt.quoteNumber).toBe("Q-2026-001");
    expect(receipt.name).toBe("Jane Doe");

    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "quote.accepted",
      expect.objectContaining({ quoteNumber: "Q-2026-001", signedBy: "Jane Doe" })
    );
  });
});

describe("POST /q/:token/decline (#68)", () => {
  it("declines the quote and emits quote.declined", async () => {
    seedQuote();
    const token = await signToken(validPayload());
    const res = await fetch(`${base}/q/${token}/decline`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(readQuoteFile().status).toBe("declined");
    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "quote.declined",
      expect.objectContaining({ quoteNumber: "Q-2026-001" })
    );
  });

  it("rejects an expired token with 400", async () => {
    seedQuote();
    const token = await signToken({ q: "Q-2026-001", s: "acme", exp: Date.now() - 1 });
    const res = await fetch(`${base}/q/${token}/decline`, { method: "POST" });
    expect(res.status).toBe(400);
    expect(readQuoteFile().status).toBe("sent");
  });
});

describe("POST /webhooks/stripe (#68)", () => {
  function stripeSig(rawBody: string, secret: string, ts = Math.floor(Date.now() / 1000)): string {
    const v1 = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
    return `t=${ts},v1=${v1}`;
  }

  function postStripe(rawBody: string, signature?: string): Promise<Response> {
    return fetch(`${base}/webhooks/stripe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(signature ? { "stripe-signature": signature } : {}),
      },
      body: rawBody,
    });
  }

  it("503s when STRIPE_WEBHOOK_SECRET is not configured", async () => {
    const res = await postStripe(JSON.stringify({ type: "x" }));
    expect(res.status).toBe(503);
  });

  it("401s on a missing or invalid signature", async () => {
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_test";
    const body = JSON.stringify({ type: "checkout.session.completed" });
    expect((await postStripe(body)).status).toBe(401);
    expect((await postStripe(body, stripeSig(body, "wrong-secret"))).status).toBe(401);
  });

  it("401s on a stale timestamp outside the tolerance window", async () => {
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_test";
    const body = JSON.stringify({ type: "checkout.session.completed" });
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const res = await postStripe(body, stripeSig(body, "whsec_test", stale));
    expect(res.status).toBe(401);
  });

  it("verifies the signature over the exact raw bytes (the #65 trap)", async () => {
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_test";
    seedQuote({ status: "accepted" });
    // Non-canonical spacing: JSON.stringify(req.body) would re-serialize
    // differently, so this only passes when rawBody is used for the HMAC.
    const body =
      '{ "type": "checkout.session.completed",   "data": { "object": { "metadata": { "quoteNumber": "Q-2026-001" } } } }';
    const res = await postStripe(body, stripeSig(body, "whsec_test"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(readQuoteFile().status).toBe("paid");
    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "quote.paid",
      expect.objectContaining({ quoteNumber: "Q-2026-001" })
    );
  });

  it("ignores unrelated event types", async () => {
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_test";
    seedQuote({ status: "accepted" });
    const body = JSON.stringify({
      type: "customer.created",
      data: { object: { metadata: { quoteNumber: "Q-2026-001" } } },
    });
    const res = await postStripe(body, stripeSig(body, "whsec_test"));
    expect(res.status).toBe(200);
    expect(readQuoteFile().status).toBe("accepted");
    expect(mockEmitEvent).not.toHaveBeenCalled();
  });
});
