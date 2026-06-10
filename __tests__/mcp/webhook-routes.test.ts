import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

const DATA_DIR = "/data";

let server: Server;
let base: string;
const envBackup: Record<string, string | undefined> = {};
const ENV_KEYS = ["GMAIL_PUBSUB_TOKEN", "MS_GRAPH_CLIENT_STATE", "SLACK_SIGNING_SECRET"];

beforeEach(async () => {
  vol.reset();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  vol.mkdirSync(`${DATA_DIR}/.agentic`, { recursive: true });
  for (const k of ENV_KEYS) {
    envBackup[k] = process.env[k];
    delete process.env[k];
  }

  const { registerWebhookRoutes } = await import("../../src/mcp/routes/webhook-routes.js");
  const { default: express } = await import("express");
  const app = express();
  // Mirror startHttp(): global JSON parsing with the raw body preserved for
  // signature-verified webhooks.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: string }).rawBody = buf.toString("utf-8");
      },
    })
  );
  registerWebhookRoutes(app, DATA_DIR);
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

describe("POST /webhooks/gmail (#65)", () => {
  it("rejects a missing/mismatching Pub/Sub token", async () => {
    process.env["GMAIL_PUBSUB_TOKEN"] = "expected";
    const res = await fetch(`${base}/webhooks/gmail`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer wrong" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);

    const noAuth = await fetch(`${base}/webhooks/gmail`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(noAuth.status).toBe(401);
  });

  it("rejects an undecodable payload with 400", async () => {
    process.env["GMAIL_PUBSUB_TOKEN"] = "tok";
    const res = await fetch(`${base}/webhooks/gmail`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer tok" },
      body: JSON.stringify({ message: { data: "" } }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts a valid Pub/Sub envelope", async () => {
    process.env["GMAIL_PUBSUB_TOKEN"] = "tok";
    const data = Buffer.from(
      JSON.stringify({ emailAddress: "me@x.com", historyId: "42" }),
      "utf-8"
    ).toString("base64");
    const res = await fetch(`${base}/webhooks/gmail`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer tok" },
      body: JSON.stringify({ message: { data } }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as object).toMatchObject({ ok: true });
  });
});

describe("/webhooks/microsoft (#65)", () => {
  it("echoes the validation token as text/plain", async () => {
    const res = await fetch(`${base}/webhooks/microsoft?validationToken=abc123`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("abc123");
  });

  it("rejects notifications with a wrong clientState", async () => {
    process.env["MS_GRAPH_CLIENT_STATE"] = "expected-state";
    const res = await fetch(`${base}/webhooks/microsoft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: [{ clientState: "evil", resource: "x" }] }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts notifications with the right clientState", async () => {
    process.env["MS_GRAPH_CLIENT_STATE"] = "expected-state";
    const res = await fetch(`${base}/webhooks/microsoft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        value: [{ clientState: "expected-state", resource: "users/u/messages/m" }],
      }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as object).toMatchObject({ ok: true });
  });
});

describe("POST /webhooks/google (#65)", () => {
  it("skips payloads without a conference record", async () => {
    const res = await fetch(`${base}/webhooks/google`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: { data: "unrelated" } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "skipped" });
  });
});

describe("POST /webhooks/slack (#65)", () => {
  function slackHeaders(body: string, secret: string): Record<string, string> {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = "v0=" + createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex");
    return {
      "content-type": "application/json",
      "x-slack-request-timestamp": ts,
      "x-slack-signature": sig,
    };
  }

  it("rejects a bad signature", async () => {
    process.env["SLACK_SIGNING_SECRET"] = "shh";
    const body = JSON.stringify({ type: "url_verification", challenge: "c1" });
    const res = await fetch(`${base}/webhooks/slack`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-slack-signature": "v0=dead",
      },
      body,
    });
    expect(res.status).toBe(401);
  });

  it("answers the url_verification challenge when signed correctly", async () => {
    process.env["SLACK_SIGNING_SECRET"] = "shh";
    const body = JSON.stringify({ type: "url_verification", challenge: "c1" });
    const res = await fetch(`${base}/webhooks/slack`, {
      method: "POST",
      headers: slackHeaders(body, "shh"),
      body,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challenge: "c1" });
  });
});
