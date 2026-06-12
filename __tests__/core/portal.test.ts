import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

const DATA_DIR = "/data";
const SCOPE = { slug: "acme", contactEmail: "jane@acme.com" };

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  vol.mkdirSync(`${DATA_DIR}/customers/acme`, { recursive: true });
});

describe("portal token (#58)", () => {
  it("round-trips, rejects tamper/expiry", async () => {
    const { signPortalToken, verifyPortalToken } = await import("../../src/core/portal.js");
    const t = signPortalToken({ s: "acme", c: "jane@acme.com", exp: Date.now() + 60_000 });
    expect(verifyPortalToken(t)).toMatchObject({ s: "acme", c: "jane@acme.com" });
    // Tamper deterministically: flip the last signature char to a guaranteed-different
    // value. (Swapping the last two chars for "00" was a no-op when the hex signature
    // already ended in "00" — a ~1/256 flake; see #89.)
    const tampered = t.slice(0, -1) + (t.endsWith("0") ? "1" : "0");
    expect(tampered).not.toBe(t);
    expect(verifyPortalToken(tampered)).toBeNull();
    expect(
      verifyPortalToken(signPortalToken({ s: "acme", c: "x@y.z", exp: Date.now() - 1 }))
    ).toBeNull();
  });
});

describe("portal actions (#58)", () => {
  it("creates a ticket + interaction from the portal", async () => {
    const { portalCreateTicket } = await import("../../src/core/portal.js");
    const ticket = await portalCreateTicket(DATA_DIR, SCOPE, {
      title: "Cannot log in",
      message: "SSO loop since today",
    });
    expect(ticket.id).toMatch(/^T-\d{3}$/);
    const fs = (await import("fs")).default;
    const interactions = fs.readFileSync(
      `${DATA_DIR}/customers/acme/interactions.md`,
      "utf-8"
    ) as string;
    expect(interactions).toContain("portal:ticket:" + ticket.id);
    expect(interactions).toContain("jane@acme.com");
  });

  it("reply works for own tickets and fires ticket.replied; foreign ids fail", async () => {
    const { portalCreateTicket, portalReply } = await import("../../src/core/portal.js");
    const ticket = await portalCreateTicket(DATA_DIR, SCOPE, { title: "Q" });

    expect(await portalReply(DATA_DIR, SCOPE, { ticketId: ticket.id, message: "ping" })).toBe(true);
    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "ticket.replied",
      expect.objectContaining({ slug: "acme", ticketId: ticket.id })
    );
    // unknown/foreign ticket id → strictly scoped
    expect(await portalReply(DATA_DIR, SCOPE, { ticketId: "T-999", message: "x" })).toBe(false);
  });
});

describe("portal rendering (#58)", () => {
  it("shows own tickets and only PUBLIC KB articles", async () => {
    const { portalCreateTicket, renderPortalHtml } = await import("../../src/core/portal.js");
    await portalCreateTicket(DATA_DIR, SCOPE, { title: "Billing question" });

    const { writeKbArticle } = await import("../../src/fs/knowledge-base.js");
    writeKbArticle(DATA_DIR, {
      id: "pub-1",
      title: "How to reset SSO",
      body: "Public SSO reset guide content",
      category: "auth",
      tags: ["sso"],
      public: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never);
    writeKbArticle(DATA_DIR, {
      id: "internal-1",
      title: "Internal escalation matrix SSO",
      body: "SECRET internal SSO runbook",
      category: "internal",
      tags: ["sso"],
      public: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never);

    const html = await renderPortalHtml(DATA_DIR, SCOPE, "TOK", { kbQuery: "sso" });
    expect(html).toContain("Billing question");
    expect(html).toContain("How to reset SSO");
    expect(html).not.toContain("SECRET internal");
    expect(html).not.toContain("escalation matrix");
    // XSS safety of token echo
    const evil = await renderPortalHtml(DATA_DIR, SCOPE, '"><script>alert(1)</script>', {});
    expect(evil).not.toContain("<script>alert(1)</script>");
  });
});

describe("buildPortalLink (#69)", () => {
  it("builds a verifiable magic link against the configured server url", async () => {
    const { buildPortalLink, verifyPortalToken } = await import("../../src/core/portal.js");
    const env = { DXCRM_SERVER_URL: "https://crm.example.com//" } as NodeJS.ProcessEnv;
    const link = buildPortalLink("acme", "jane@acme.com", 7, env);
    expect(link.startsWith("https://crm.example.com/portal?token=")).toBe(true);
    const token = link.split("token=")[1]!;
    const payload = verifyPortalToken(token, Date.now(), env);
    expect(payload).toMatchObject({ s: "acme", c: "jane@acme.com" });
    expect(payload!.exp).toBeLessThanOrEqual(Date.now() + 7 * 86_400_000 + 1000);
  });

  it("defaults to localhost:3847", async () => {
    const { buildPortalLink } = await import("../../src/core/portal.js");
    expect(buildPortalLink("acme", "j@a.com", 1, {} as NodeJS.ProcessEnv)).toContain(
      "http://localhost:3847/portal?token="
    );
  });
});
