import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Copper ────────────────────────────────────────────────────────────────────

describe("CopperConnector", () => {
  it("yields contacts from API response", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 1, name: "Alice Smith", emails: [{ email: "alice@acme.com" }], company_name: "Acme" },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }), // stop pagination
      } as Response);

    const { makeCopperConnector } = await import("../../src/sync/connectors/copper.js");
    const connector = makeCopperConnector("user@example.com");
    const contacts = [];
    for await (const c of connector.fetchContacts("token", "")) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(1);
    expect(contacts[0].name).toBe("Alice Smith");
    expect(contacts[0].email).toBe("alice@acme.com");
    expect(contacts[0].company).toBe("Acme");
  });

  it("throws on non-OK response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const { makeCopperConnector } = await import("../../src/sync/connectors/copper.js");
    const connector = makeCopperConnector("user@example.com");
    await expect(async () => {
      for await (const _ of connector.fetchContacts("bad-token", "")) { /* noop */ }
    }).rejects.toThrow("Copper API error");
  });

  it("yields activities with date conversion", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 101, type: { category: "call" }, details: "Follow-up call", activity_date: 1748563200 },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) } as Response);

    const { makeCopperConnector } = await import("../../src/sync/connectors/copper.js");
    const connector = makeCopperConnector("user@example.com");
    const activities = [];
    for await (const a of connector.fetchActivities("token", "")) {
      activities.push(a);
    }
    expect(activities.length).toBe(1);
    expect(activities[0].type).toBe("call");
    expect(activities[0].notes).toBe("Follow-up call");
  });
});

// ─── Zendesk ───────────────────────────────────────────────────────────────────

describe("ZendeskConnector", () => {
  it("yields contacts from API response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { data: { id: 1, name: "Bob Jones", email: "bob@beta.com", organization_name: "Beta" } },
        ],
        meta: { has_more: false },
      }),
    } as Response);

    const { ZendeskConnector } = await import("../../src/sync/connectors/zendesk.js");
    const contacts = [];
    for await (const c of ZendeskConnector.fetchContacts("token", "https://api.getbase.com")) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(1);
    expect(contacts[0].name).toBe("Bob Jones");
    expect(contacts[0].email).toBe("bob@beta.com");
  });

  it("stops pagination when has_more is false", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], meta: { has_more: false } }),
    } as Response);

    const { ZendeskConnector } = await import("../../src/sync/connectors/zendesk.js");
    const contacts = [];
    for await (const c of ZendeskConnector.fetchContacts("token", "https://api.getbase.com")) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(0);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});

// ─── Freshsales ────────────────────────────────────────────────────────────────

describe("FreshsalesConnector", () => {
  it("yields contacts from API response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        contacts: [
          { id: 1, first_name: "Carol", last_name: "White", email: "carol@gamma.com", account: { name: "Gamma" } },
        ],
        meta: { total_pages: 1 },
      }),
    } as Response);

    const { FreshsalesConnector } = await import("../../src/sync/connectors/freshsales.js");
    const contacts = [];
    for await (const c of FreshsalesConnector.fetchContacts("api-key", "gamma.freshsales.io")) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(1);
    expect(contacts[0].name).toContain("Carol");
    expect(contacts[0].email).toBe("carol@gamma.com");
  });
});
