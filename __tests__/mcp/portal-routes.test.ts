import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

const DATA_DIR = "/data";
const SLUG = "acme";
const EMAIL = "jane@acme.com";

let server: Server;
let base: string;

beforeEach(async () => {
  vol.reset();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  vol.mkdirSync(`${DATA_DIR}/customers/${SLUG}`, { recursive: true });

  const { registerPortalRoutes } = await import("../../src/mcp/routes/portal-routes.js");
  const { default: express } = await import("express");
  const app = express();
  app.use(express.json());
  registerPortalRoutes(app, DATA_DIR);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function validToken(exp = Date.now() + 86_400_000): Promise<string> {
  const { signPortalToken } = await import("../../src/core/portal.js");
  return signPortalToken({ s: SLUG, c: EMAIL, exp });
}

function postForm(path: string, fields: Record<string, string>): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("GET /portal (#68)", () => {
  it("401s without a token", async () => {
    const res = await fetch(`${base}/portal`);
    expect(res.status).toBe(401);
  });

  it("401s on an expired token", async () => {
    const token = await validToken(Date.now() - 1000);
    const res = await fetch(`${base}/portal?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(401);
  });

  it("401s on a tampered token", async () => {
    const token = await validToken();
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    const res = await fetch(`${base}/portal?token=${encodeURIComponent(tampered)}`);
    expect(res.status).toBe(401);
  });

  it("renders the scoped portal for a valid token", async () => {
    const token = await validToken();
    const res = await fetch(`${base}/portal?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("Support Portal");
    expect(html).toContain(EMAIL);
  });
});

describe("POST /portal/ticket (#68)", () => {
  it("401s on an invalid token", async () => {
    const res = await postForm("/portal/ticket", { token: "garbage", title: "Help" });
    expect(res.status).toBe(401);
  });

  it("401s when the title is missing", async () => {
    const token = await validToken();
    const res = await postForm("/portal/ticket", { token });
    expect(res.status).toBe(401);
  });

  it("creates a ticket scoped to the customer and confirms with a flash", async () => {
    const token = await validToken();
    const res = await postForm("/portal/ticket", {
      token,
      title: "Cannot log in",
      message: "Since this morning",
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("created");
    expect(html).toContain("Cannot log in");

    const { readTickets } = await import("../../src/fs/ticket-writer.js");
    const tickets = await readTickets(DATA_DIR, SLUG);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.title).toBe("Cannot log in");
    expect(tickets[0]!.status).toBe("open");
  });

  it("escapes HTML in rendered ticket titles (XSS)", async () => {
    const token = await validToken();
    const res = await postForm("/portal/ticket", {
      token,
      title: '<script>alert("xss")</script>',
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("POST /portal/reply (#68)", () => {
  it("401s when ticketId or message is missing", async () => {
    const token = await validToken();
    expect((await postForm("/portal/reply", { token, message: "hi" })).status).toBe(401);
    expect((await postForm("/portal/reply", { token, ticketId: "T-001" })).status).toBe(401);
  });

  it("404s for a foreign/unknown ticket id (strict scoping)", async () => {
    const token = await validToken();
    const res = await postForm("/portal/reply", {
      token,
      ticketId: "T-999",
      message: "is this fixed?",
    });
    expect(res.status).toBe(404);
  });

  it("replies to an own ticket and emits ticket.replied", async () => {
    const token = await validToken();
    await postForm("/portal/ticket", { token, title: "Slow dashboard" });
    mockEmitEvent.mockClear();

    const { readTickets } = await import("../../src/fs/ticket-writer.js");
    const [ticket] = await readTickets(DATA_DIR, SLUG);
    const res = await postForm("/portal/reply", {
      token,
      ticketId: ticket!.id,
      message: "Any update?",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(`Reply added to ${ticket!.id}`);
    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "ticket.replied",
      expect.objectContaining({ slug: SLUG, ticketId: ticket!.id, from: EMAIL })
    );
  });
});
