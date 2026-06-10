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
const ENV_KEYS = ["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"];

beforeEach(async () => {
  vol.reset();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  vol.mkdirSync(`${DATA_DIR}/.agentic`, { recursive: true });
  for (const k of ENV_KEYS) {
    envBackup[k] = process.env[k];
    delete process.env[k];
  }

  const { registerConversationRoutes, resetConversationGuards } =
    await import("../../src/mcp/routes/conversation-routes.js");
  resetConversationGuards();
  const { default: express } = await import("express");
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: string }).rawBody = buf.toString("utf-8");
      },
    })
  );
  registerConversationRoutes(app, DATA_DIR);
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

function postChat(body: Record<string, unknown>, ip = "203.0.113.10"): Promise<Response> {
  return fetch(`${base}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /chat (#61)", () => {
  it("ingests a message and returns the conversation id", async () => {
    const res = await postChat({ sessionId: "s1", message: "hello" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; conversationId: string };
    expect(json.ok).toBe(true);
    expect(json.conversationId).toMatch(/^conv_/);

    const { listConversations } = await import("../../src/core/conversations.js");
    expect(listConversations(DATA_DIR, {})).toHaveLength(1);
  });

  it("rejects missing fields with 400", async () => {
    const res = await postChat({ sessionId: "s1" });
    expect(res.status).toBe(400);
  });

  it("silently ignores honeypot submissions but fakes success", async () => {
    const res = await postChat({ sessionId: "s-bot", message: "buy now", _hp: "gotcha" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; conversationId: string };
    expect(json.ok).toBe(true);
    expect(json.conversationId).toMatch(/^conv_/);

    const { listConversations } = await import("../../src/core/conversations.js");
    expect(listConversations(DATA_DIR, {})).toHaveLength(0);
  });

  it("rate-limits per IP with 429, other IPs unaffected", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await postChat({ sessionId: "s1", message: `m${i}` }, "198.51.100.1");
      expect(res.status).toBe(200);
    }
    const blocked = await postChat({ sessionId: "s1", message: "one too many" }, "198.51.100.1");
    expect(blocked.status).toBe(429);

    const other = await postChat({ sessionId: "s2", message: "hi" }, "198.51.100.2");
    expect(other.status).toBe(200);
  });
});

describe("GET /chat/poll (#62)", () => {
  it("returns agent replies after the cursor", async () => {
    await postChat({ sessionId: "sess-x", message: "anyone there?" });
    const { listConversations, replyConversation } =
      await import("../../src/core/conversations.js");
    const conv = listConversations(DATA_DIR, {})[0]!;
    await replyConversation(DATA_DIR, conv.id, { message: "yes — hi!", by: "alice" });

    const res = await fetch(`${base}/chat/poll?sessionId=sess-x&after=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = (await res.json()) as {
      messages: Array<{ from: string; text: string }>;
      cursor: number;
    };
    expect(json.cursor).toBe(2);
    expect(json.messages).toEqual([expect.objectContaining({ from: "agent", text: "yes — hi!" })]);
  });

  it("returns an empty result for unknown sessions", async () => {
    const res = await fetch(`${base}/chat/poll?sessionId=unknown`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messages: [], cursor: 0, status: null });
  });

  it("requires a sessionId", async () => {
    const res = await fetch(`${base}/chat/poll`);
    expect(res.status).toBe(400);
  });

  it("is not throttled by the stricter /chat bucket", async () => {
    // 25 polls from one IP — more than the /chat max — must all pass.
    for (let i = 0; i < 25; i++) {
      const res = await fetch(`${base}/chat/poll?sessionId=s&after=0`, {
        headers: { "x-forwarded-for": "198.51.100.9" },
      });
      expect(res.status).toBe(200);
    }
  });
});

describe("WhatsApp webhook (#61)", () => {
  const inbound = {
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ profile: { name: "Bob" }, wa_id: "15557654321" }],
              messages: [{ from: "15557654321", text: { body: "hey" }, type: "text" }],
            },
          },
        ],
      },
    ],
  };

  it("GET verifies the handshake against WHATSAPP_VERIFY_TOKEN", async () => {
    process.env["WHATSAPP_VERIFY_TOKEN"] = "tok";
    const ok = await fetch(
      `${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=c123`
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("c123");

    const bad = await fetch(
      `${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=c123`
    );
    expect(bad.status).toBe(403);
  });

  it("POST ingests inbound messages (no secret configured)", async () => {
    const res = await fetch(`${base}/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(inbound),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, received: 1 });
  });

  it("POST rejects a bad signature when WHATSAPP_APP_SECRET is set", async () => {
    process.env["WHATSAPP_APP_SECRET"] = "shh";
    const raw = JSON.stringify(inbound);

    const bad = await fetch(`${base}/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=dead" },
      body: raw,
    });
    expect(bad.status).toBe(401);

    const sig = "sha256=" + createHmac("sha256", "shh").update(raw).digest("hex");
    const ok = await fetch(`${base}/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sig },
      body: raw,
    });
    expect(ok.status).toBe(200);
  });

  it("rate-limits per IP with 429", async () => {
    for (let i = 0; i < 100; i++) {
      const res = await fetch(`${base}/webhooks/whatsapp`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.50" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
    }
    const blocked = await fetch(`${base}/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.50" },
      body: JSON.stringify({}),
    });
    expect(blocked.status).toBe(429);
  });
});

describe("GET /chat/widget.js", () => {
  it("serves the widget with honeypot and poll wiring", async () => {
    const res = await fetch(`${base}/chat/widget.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
    const js = await res.text();
    expect(js).toContain("_hp");
    expect(js).toContain("/chat/poll");
  });
});

describe("whatsapp secrets via vault fallback (#72)", () => {
  it("verifies the GET handshake with a vault-stored WHATSAPP_VERIFY_TOKEN", async () => {
    const { setSecret } = await import("../../src/core/vault.js");
    setSecret(DATA_DIR, "master-key", "WHATSAPP_VERIFY_TOKEN", "vault-verify");
    process.env["DXCRM_VAULT_KEY"] = "master-key";
    try {
      const res = await fetch(
        `${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=vault-verify&hub.challenge=c123`
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("c123");
    } finally {
      delete process.env["DXCRM_VAULT_KEY"];
    }
  });

  it("enforces signature verification once the app secret exists in the vault", async () => {
    const { setSecret } = await import("../../src/core/vault.js");
    setSecret(DATA_DIR, "master-key", "WHATSAPP_APP_SECRET", "vault-app-secret");
    process.env["DXCRM_VAULT_KEY"] = "master-key";
    try {
      const res = await fetch(`${base}/webhooks/whatsapp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entry: [] }),
      });
      expect(res.status).toBe(401);
    } finally {
      delete process.env["DXCRM_VAULT_KEY"];
    }
  });
});
