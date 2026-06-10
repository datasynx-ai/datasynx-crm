import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

const DATA_DIR = "/data";

let server: Server;
let base: string;

beforeEach(async () => {
  vol.reset();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  vol.mkdirSync(`${DATA_DIR}/.agentic`, { recursive: true });

  const { registerEngagementRoutes } = await import("../../src/mcp/routes/engagement-routes.js");
  const { default: express } = await import("express");
  const app = express();
  app.use(express.json());
  registerEngagementRoutes(app, DATA_DIR);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function seedPendingSurvey(token = "tok1234567890abc"): Promise<string> {
  const { savePendingSurvey } = await import("../../src/core/survey-engine.js");
  await savePendingSurvey(DATA_DIR, "nps-q2", "acme", "jane@acme.com", token);
  return token;
}

async function readResponses(): Promise<Array<{ score: number; comment?: string }>> {
  const { loadSurveyResponses } = await import("../../src/core/survey-engine.js");
  return loadSurveyResponses(DATA_DIR, "nps-q2");
}

describe("GET /survey/respond (#68)", () => {
  it("400s without a token", async () => {
    const res = await fetch(`${base}/survey/respond?score=9`);
    expect(res.status).toBe(400);
  });

  it("400s on out-of-bounds or non-numeric scores", async () => {
    const token = await seedPendingSurvey();
    for (const score of ["11", "-1", "abc", ""]) {
      const res = await fetch(`${base}/survey/respond?token=${token}&score=${score}`);
      expect(res.status).toBe(400);
    }
    expect(await readResponses()).toHaveLength(0);
  });

  it("records a valid score and thanks the respondent", async () => {
    const token = await seedPendingSurvey();
    const res = await fetch(`${base}/survey/respond?token=${token}&score=10`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("10/10");
    const responses = await readResponses();
    expect(responses).toHaveLength(1);
    expect(responses[0]!.score).toBe(10);
  });

  it("accepts boundary scores 0 and 10", async () => {
    const t1 = await seedPendingSurvey("tokboundary00001");
    expect((await fetch(`${base}/survey/respond?token=${t1}&score=0`)).status).toBe(200);
    const t2 = await seedPendingSurvey("tokboundary00002");
    expect((await fetch(`${base}/survey/respond?token=${t2}&score=10`)).status).toBe(200);
  });

  it("renders the comment form with the token escaped", async () => {
    const res = await fetch(`${base}/survey/respond?token=abc"><script>x</script>&comment=true`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Leave a comment");
    expect(html).not.toContain("<script>x</script>");
  });
});

describe("POST /survey/respond (#68)", () => {
  it("records score + comment and escapes the comment in the thank-you page", async () => {
    const token = await seedPendingSurvey();
    const res = await fetch(`${base}/survey/respond`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token,
        score: "3",
        comment: "<img src=x onerror=alert(1)> too slow",
      }).toString(),
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("3/10");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    const responses = await readResponses();
    expect(responses).toHaveLength(1);
    expect(responses[0]!.comment).toContain("too slow");
  });

  it("400s on an out-of-bounds score", async () => {
    const token = await seedPendingSurvey();
    const res = await fetch(`${base}/survey/respond`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, score: "12" }).toString(),
    });
    expect(res.status).toBe(400);
    expect(await readResponses()).toHaveLength(0);
  });
});

describe("GET /t/o/:token.gif — open tracking (#68)", () => {
  async function openToken(): Promise<string> {
    const { signToken } = await import("../../src/core/email-tracking.js");
    return signToken({ s: "acme", m: "msg-1", c: "jane@acme.com", k: "open" });
  }

  it("returns the GIF and logs an open event for a valid token", async () => {
    const res = await fetch(`${base}/t/o/${await openToken()}.gif`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/gif");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const { readEmailEvents } = await import("../../src/fs/sent-store.js");
    const events = readEmailEvents(DATA_DIR);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "open", slug: "acme", messageId: "msg-1" });
  });

  it("still returns the GIF for an invalid token but logs nothing", async () => {
    const res = await fetch(`${base}/t/o/tampered-token.gif`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/gif");

    const { readEmailEvents } = await import("../../src/fs/sent-store.js");
    expect(readEmailEvents(DATA_DIR)).toHaveLength(0);
  });
});

describe("GET /t/c/:token — click tracking (#68)", () => {
  it("redirects to the signed destination and logs a click event", async () => {
    const { signToken } = await import("../../src/core/email-tracking.js");
    const token = signToken({
      s: "acme",
      m: "msg-1",
      c: "jane@acme.com",
      k: "click",
      u: "https://example.com/pricing",
    });
    const res = await fetch(`${base}/t/c/${token}`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/pricing");

    const { readEmailEvents } = await import("../../src/fs/sent-store.js");
    const events = readEmailEvents(DATA_DIR);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "click", url: "https://example.com/pricing" });
  });

  it("400s on a tampered token — never an open redirect", async () => {
    const { signToken } = await import("../../src/core/email-tracking.js");
    const token = signToken({
      s: "acme",
      m: "msg-1",
      c: "jane@acme.com",
      k: "click",
      u: "https://example.com/ok",
    });
    // Tamper with the payload (swap the destination) but keep the signature.
    const [body, sig] = token.split(".");
    const evil = Buffer.from(
      JSON.stringify({
        s: "acme",
        m: "msg-1",
        c: "jane@acme.com",
        k: "click",
        u: "https://evil.example",
      }),
      "utf-8"
    ).toString("base64url");
    const res = await fetch(`${base}/t/c/${evil}.${sig}`, { redirect: "manual" });
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
    void body;

    const { readEmailEvents } = await import("../../src/fs/sent-store.js");
    expect(readEmailEvents(DATA_DIR)).toHaveLength(0);
  });

  it("400s for an open-kind token used on the click endpoint", async () => {
    const { signToken } = await import("../../src/core/email-tracking.js");
    const token = signToken({ s: "acme", m: "msg-1", c: "jane@acme.com", k: "open" });
    const res = await fetch(`${base}/t/c/${token}`, { redirect: "manual" });
    expect(res.status).toBe(400);
  });
});

describe("GET /dashboard (#68)", () => {
  it("401s without or with an invalid token", async () => {
    expect((await fetch(`${base}/dashboard`)).status).toBe(401);
    expect((await fetch(`${base}/dashboard?token=garbage`)).status).toBe(401);
  });

  it("401s on an expired token", async () => {
    const { signDashboardToken } = await import("../../src/core/dashboard.js");
    const token = signDashboardToken({ a: "alice", exp: Date.now() - 1000 });
    const res = await fetch(`${base}/dashboard?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(401);
  });

  it("renders the dashboard for a valid token", async () => {
    const { signDashboardToken } = await import("../../src/core/dashboard.js");
    const token = signDashboardToken({ a: "alice", exp: Date.now() + 60_000 });
    const res = await fetch(`${base}/dashboard?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("alice");
  });
});
