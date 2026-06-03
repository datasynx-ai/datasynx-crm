import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.resetModules();
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
            {
              id: 1,
              name: "Alice Smith",
              emails: [{ email: "alice@acme.com" }],
              company_name: "Acme",
            },
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
      for await (const _ of connector.fetchContacts("bad-token", "")) {
        /* noop */
      }
    }).rejects.toThrow("Copper API error");
  });

  it("yields activities with date conversion", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 101,
              type: { category: "call" },
              details: "Follow-up call",
              activity_date: 1748563200,
            },
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

  it("follows cursor pagination for contacts", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ data: { id: 1, name: "Alice", email: "alice@a.com" } }],
          meta: { has_more: true, next_cursor: "cursor-abc" },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ data: { id: 2, name: "Bob", email: "bob@b.com" } }],
          meta: { has_more: false },
        }),
      } as Response);

    const { ZendeskConnector } = await import("../../src/sync/connectors/zendesk.js");
    const contacts = [];
    for await (const c of ZendeskConnector.fetchContacts("token", "https://api.getbase.com")) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(2);
    const secondCall = vi.mocked(fetch).mock.calls[1]![0] as string;
    expect(secondCall).toContain("cursor=cursor-abc");
  });

  it("stops on non-OK response for contacts", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401 } as Response);

    const { ZendeskConnector } = await import("../../src/sync/connectors/zendesk.js");
    const contacts = [];
    for await (const c of ZendeskConnector.fetchContacts("bad-token", "https://api.getbase.com")) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(0);
  });

  it("yields activities from API response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            data: {
              id: 10,
              type: "call",
              subject: "Demo call",
              notes: "Went well",
              created_at: "2026-01-15T10:00:00Z",
              contact_id: 1,
            },
          },
        ],
        meta: { has_more: false },
      }),
    } as Response);

    const { ZendeskConnector } = await import("../../src/sync/connectors/zendesk.js");
    const activities = [];
    for await (const a of ZendeskConnector.fetchActivities("token", "https://api.getbase.com")) {
      activities.push(a);
    }
    expect(activities.length).toBe(1);
    expect(activities[0]!.type).toBe("call");
    expect(activities[0]!.subject).toBe("Demo call");
    expect(activities[0]!.notes).toBe("Went well");
    expect(activities[0]!.date).toBe("2026-01-15");
    expect(activities[0]!.contactId).toBe("1");
  });

  it("follows cursor pagination for activities", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ data: { id: 1, type: "email" } }],
          meta: { has_more: true, next_cursor: "c2" },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ data: { id: 2, type: "call" } }],
          meta: { has_more: false },
        }),
      } as Response);

    const { ZendeskConnector } = await import("../../src/sync/connectors/zendesk.js");
    const activities = [];
    for await (const a of ZendeskConnector.fetchActivities("token", "https://api.getbase.com")) {
      activities.push(a);
    }
    expect(activities.length).toBe(2);
  });

  it("stops on non-OK response for activities", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 403 } as Response);

    const { ZendeskConnector } = await import("../../src/sync/connectors/zendesk.js");
    const activities = [];
    for await (const a of ZendeskConnector.fetchActivities("token", "https://api.getbase.com")) {
      activities.push(a);
    }
    expect(activities.length).toBe(0);
  });

  it("uses 'Other' type when activity type is missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ data: { id: 5 } }],
        meta: { has_more: false },
      }),
    } as Response);

    const { ZendeskConnector } = await import("../../src/sync/connectors/zendesk.js");
    const activities = [];
    for await (const a of ZendeskConnector.fetchActivities("token", "https://api.getbase.com")) {
      activities.push(a);
    }
    expect(activities[0]!.type).toBe("Other");
  });
});

// ─── Freshsales ────────────────────────────────────────────────────────────────

describe("FreshsalesConnector", () => {
  it("yields contacts from API response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        contacts: [
          {
            id: 1,
            first_name: "Carol",
            last_name: "White",
            email: "carol@gamma.com",
            account: { name: "Gamma" },
          },
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
    expect(contacts[0]!.name).toContain("Carol");
    expect(contacts[0]!.email).toBe("carol@gamma.com");
  });

  it("includes company name from company.name field", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        contacts: [{ id: 2, first_name: "Dan", company: { name: "Delta Ltd" }, meta: undefined }],
        meta: { total_pages: 1 },
      }),
    } as Response);

    const { FreshsalesConnector } = await import("../../src/sync/connectors/freshsales.js");
    const contacts = [];
    for await (const c of FreshsalesConnector.fetchContacts("key", "delta.freshsales.io")) {
      contacts.push(c);
    }
    expect(contacts[0]!.company).toBe("Delta Ltd");
  });

  it("follows multi-page pagination for contacts", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          contacts: [{ id: 1, first_name: "Alice" }],
          meta: { total_pages: 2 },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          contacts: [{ id: 2, first_name: "Bob" }],
          meta: { total_pages: 2 },
        }),
      } as Response);

    const { FreshsalesConnector } = await import("../../src/sync/connectors/freshsales.js");
    const contacts = [];
    for await (const c of FreshsalesConnector.fetchContacts(
      "key",
      "https://example.freshsales.io"
    )) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(2);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it("stops on non-OK response for contacts", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401 } as Response);

    const { FreshsalesConnector } = await import("../../src/sync/connectors/freshsales.js");
    const contacts = [];
    for await (const c of FreshsalesConnector.fetchContacts(
      "bad-key",
      "https://example.freshsales.io"
    )) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(0);
  });

  it("yields activities from API response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        activities: [
          {
            id: 20,
            type: "call",
            title: "Discovery call",
            description: "Discussed pricing",
            created_at: "2026-02-10T09:00:00Z",
            targetable_id: 1,
          },
        ],
        meta: { total_pages: 1 },
      }),
    } as Response);

    const { FreshsalesConnector } = await import("../../src/sync/connectors/freshsales.js");
    const activities = [];
    for await (const a of FreshsalesConnector.fetchActivities(
      "key",
      "https://example.freshsales.io"
    )) {
      activities.push(a);
    }
    expect(activities.length).toBe(1);
    expect(activities[0]!.type).toBe("call");
    expect(activities[0]!.subject).toBe("Discovery call");
    expect(activities[0]!.notes).toBe("Discussed pricing");
    expect(activities[0]!.date).toBe("2026-02-10");
    expect(activities[0]!.contactId).toBe("1");
  });

  it("follows multi-page pagination for activities", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          activities: [{ id: 1, type: "email" }],
          meta: { total_pages: 2 },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          activities: [{ id: 2, type: "call" }],
          meta: { total_pages: 2 },
        }),
      } as Response);

    const { FreshsalesConnector } = await import("../../src/sync/connectors/freshsales.js");
    const activities = [];
    for await (const a of FreshsalesConnector.fetchActivities(
      "key",
      "https://example.freshsales.io"
    )) {
      activities.push(a);
    }
    expect(activities.length).toBe(2);
  });

  it("stops on non-OK response for activities", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 403 } as Response);

    const { FreshsalesConnector } = await import("../../src/sync/connectors/freshsales.js");
    const activities = [];
    for await (const a of FreshsalesConnector.fetchActivities(
      "key",
      "https://example.freshsales.io"
    )) {
      activities.push(a);
    }
    expect(activities.length).toBe(0);
  });

  it("uses 'Other' type when activity type is missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        activities: [{ id: 3, title: "Unknown task" }],
        meta: { total_pages: 1 },
      }),
    } as Response);

    const { FreshsalesConnector } = await import("../../src/sync/connectors/freshsales.js");
    const activities = [];
    for await (const a of FreshsalesConnector.fetchActivities(
      "key",
      "https://example.freshsales.io"
    )) {
      activities.push(a);
    }
    expect(activities[0]!.type).toBe("Other");
  });

  it("uses 'Unknown' name when first and last names are missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        contacts: [{ id: 99 }],
        meta: { total_pages: 1 },
      }),
    } as Response);

    const { FreshsalesConnector } = await import("../../src/sync/connectors/freshsales.js");
    const contacts = [];
    for await (const c of FreshsalesConnector.fetchContacts(
      "key",
      "https://example.freshsales.io"
    )) {
      contacts.push(c);
    }
    expect(contacts[0]!.name).toBe("Unknown");
  });
});

// ─── Dynamics 365 ──────────────────────────────────────────────────────────────

describe("DynamicsConnector", () => {
  it("yields contacts from OData response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          {
            contactid: "d1",
            fullname: "Eve Davis",
            emailaddress1: "eve@delta.com",
            telephone1: "555",
          },
        ],
      }),
    } as Response);

    const { DynamicsConnector } = await import("../../src/sync/connectors/dynamics.js");
    const contacts = [];
    for await (const c of DynamicsConnector.fetchContacts(
      "token",
      "https://org.crm.dynamics.com"
    )) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(1);
    expect(contacts[0]!.id).toBe("d1");
    expect(contacts[0]!.name).toBe("Eve Davis");
    expect(contacts[0]!.email).toBe("eve@delta.com");
  });

  it("follows @odata.nextLink pagination for contacts", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [{ contactid: "d1", fullname: "Alice" }],
          "@odata.nextLink": "https://org.crm.dynamics.com/api/data/v9.2/contacts?$skiptoken=xyz",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [{ contactid: "d2", fullname: "Bob" }] }),
      } as Response);

    const { DynamicsConnector } = await import("../../src/sync/connectors/dynamics.js");
    const contacts = [];
    for await (const c of DynamicsConnector.fetchContacts(
      "token",
      "https://org.crm.dynamics.com"
    )) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(2);
  });

  it("throws on non-OK response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401 } as Response);

    const { DynamicsConnector } = await import("../../src/sync/connectors/dynamics.js");
    await expect(async () => {
      for await (const _ of DynamicsConnector.fetchContacts(
        "bad",
        "https://org.crm.dynamics.com"
      )) {
        /* noop */
      }
    }).rejects.toThrow("Dynamics API error");
  });

  it("yields activities from OData response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          {
            activityid: "a1",
            activitytypecode: "task",
            subject: "Follow-up",
            description: "Check in",
            actualstart: "2026-03-01T09:00:00Z",
            _regardingobjectid_value: "d1",
          },
        ],
      }),
    } as Response);

    const { DynamicsConnector } = await import("../../src/sync/connectors/dynamics.js");
    const activities = [];
    for await (const a of DynamicsConnector.fetchActivities(
      "token",
      "https://org.crm.dynamics.com"
    )) {
      activities.push(a);
    }
    expect(activities.length).toBe(1);
    expect(activities[0]!.id).toBe("a1");
    expect(activities[0]!.type).toBe("task");
    expect(activities[0]!.date).toBe("2026-03-01");
    expect(activities[0]!.contactId).toBe("d1");
  });

  it("uses 'Unknown' name when fullname is missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: [{ contactid: "d99" }] }),
    } as Response);

    const { DynamicsConnector } = await import("../../src/sync/connectors/dynamics.js");
    const contacts = [];
    for await (const c of DynamicsConnector.fetchContacts(
      "token",
      "https://org.crm.dynamics.com"
    )) {
      contacts.push(c);
    }
    expect(contacts[0]!.name).toBe("Unknown");
  });
});

// ─── Monday.com ────────────────────────────────────────────────────────────────

describe("MondayConnector", () => {
  it("yields contacts from board items", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          boards: [
            {
              items_page: {
                cursor: undefined,
                items: [
                  {
                    id: "m1",
                    name: "Frank Ltd",
                    column_values: [
                      { id: "email_column", text: "frank@frank.com" },
                      { id: "phone_column", text: "123456" },
                    ],
                  },
                ],
              },
            },
          ],
        },
      }),
    } as Response);

    const { MondayConnector } = await import("../../src/sync/connectors/monday.js");
    const contacts = [];
    for await (const c of MondayConnector.fetchContacts("token", "12345")) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(1);
    expect(contacts[0]!.id).toBe("m1");
    expect(contacts[0]!.name).toBe("Frank Ltd");
    expect(contacts[0]!.email).toBe("frank@frank.com");
  });

  it("follows cursor pagination", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            boards: [
              {
                items_page: {
                  cursor: "c1",
                  items: [{ id: "m1", name: "First", column_values: [] }],
                },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            next_items_page: {
              cursor: undefined,
              items: [{ id: "m2", name: "Second", column_values: [] }],
            },
          },
        }),
      } as Response);

    const { MondayConnector } = await import("../../src/sync/connectors/monday.js");
    const contacts = [];
    for await (const c of MondayConnector.fetchContacts("token", "12345")) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(2);
  });

  it("throws on non-OK response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 403 } as Response);

    const { MondayConnector } = await import("../../src/sync/connectors/monday.js");
    await expect(async () => {
      for await (const _ of MondayConnector.fetchContacts("bad", "12345")) {
        /* noop */
      }
    }).rejects.toThrow("Monday API error");
  });

  it("yields no activities (Monday has no native activities)", async () => {
    const { MondayConnector } = await import("../../src/sync/connectors/monday.js");
    const activities = [];
    for await (const a of MondayConnector.fetchActivities("token", "12345")) {
      activities.push(a);
    }
    expect(activities.length).toBe(0);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ─── SugarCRM ──────────────────────────────────────────────────────────────────

describe("SugarCRMConnector", () => {
  it("yields contacts from API response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        records: [
          {
            id: "s1",
            full_name: "Grace Ho",
            email1: "grace@sugar.com",
            phone_mobile: "999",
            account_name: "Sugar Inc",
          },
        ],
        next_offset: -1,
      }),
    } as Response);

    const { SugarCRMConnector } = await import("../../src/sync/connectors/sugarcrm.js");
    const contacts = [];
    for await (const c of SugarCRMConnector.fetchContacts("token", "https://sugar.example.com")) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(1);
    expect(contacts[0]!.name).toBe("Grace Ho");
    expect(contacts[0]!.email).toBe("grace@sugar.com");
    expect(contacts[0]!.company).toBe("Sugar Inc");
  });

  it("follows offset pagination for contacts", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records: [{ id: "s1", full_name: "Alice" }],
          next_offset: 100,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records: [{ id: "s2", full_name: "Bob" }],
          next_offset: -1,
        }),
      } as Response);

    const { SugarCRMConnector } = await import("../../src/sync/connectors/sugarcrm.js");
    const contacts = [];
    for await (const c of SugarCRMConnector.fetchContacts("token", "https://sugar.example.com")) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(2);
    const secondCallUrl = vi.mocked(fetch).mock.calls[1]![0] as string;
    expect(secondCallUrl).toContain("offset=100");
  });

  it("stops on non-OK response for contacts", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401 } as Response);

    const { SugarCRMConnector } = await import("../../src/sync/connectors/sugarcrm.js");
    const contacts = [];
    for await (const c of SugarCRMConnector.fetchContacts("bad", "https://sugar.example.com")) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(0);
  });

  it("yields activities with date and contactId", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        records: [
          {
            id: "a1",
            activity_type: "Call",
            name: "Intro call",
            description: "First contact",
            date_start: "2026-04-01T10:00:00Z",
            contact_id: "s1",
          },
        ],
        next_offset: -1,
      }),
    } as Response);

    const { SugarCRMConnector } = await import("../../src/sync/connectors/sugarcrm.js");
    const activities = [];
    for await (const a of SugarCRMConnector.fetchActivities("token", "https://sugar.example.com")) {
      activities.push(a);
    }
    expect(activities.length).toBe(1);
    expect(activities[0]!.type).toBe("Call");
    expect(activities[0]!.date).toBe("2026-04-01");
    expect(activities[0]!.contactId).toBe("s1");
  });

  it("uses 'Other' activity type when missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        records: [{ id: "a2", name: "Unknown task" }],
        next_offset: -1,
      }),
    } as Response);

    const { SugarCRMConnector } = await import("../../src/sync/connectors/sugarcrm.js");
    const activities = [];
    for await (const a of SugarCRMConnector.fetchActivities("token", "https://sugar.example.com")) {
      activities.push(a);
    }
    expect(activities[0]!.type).toBe("Other");
  });
});

// ─── Zoho CRM ──────────────────────────────────────────────────────────────────

describe("ZohoConnector", () => {
  it("yields contacts from API response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "z1",
            Full_Name: "Hana Kim",
            Email: "hana@zoho.com",
            Phone: "777",
            Account_Name: { name: "Zoho Co" },
          },
        ],
        info: { more_records: false },
      }),
    } as Response);

    const { ZohoConnector } = await import("../../src/sync/connectors/zoho.js");
    const contacts = [];
    for await (const c of ZohoConnector.fetchContacts("token", "https://www.zohoapis.com")) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(1);
    expect(contacts[0]!.id).toBe("z1");
    expect(contacts[0]!.name).toBe("Hana Kim");
    expect(contacts[0]!.email).toBe("hana@zoho.com");
    expect(contacts[0]!.company).toBe("Zoho Co");
  });

  it("throws on non-OK response for contacts", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401 } as Response);

    const { ZohoConnector } = await import("../../src/sync/connectors/zoho.js");
    await expect(async () => {
      for await (const _ of ZohoConnector.fetchContacts("bad", "https://www.zohoapis.com")) {
        /* noop */
      }
    }).rejects.toThrow("Zoho API error");
  });

  it("follows page pagination for contacts", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: "z1", Full_Name: "Alice" }],
          info: { more_records: true, page: 1 },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: "z2", Full_Name: "Bob" }],
          info: { more_records: false, page: 2 },
        }),
      } as Response);

    const { ZohoConnector } = await import("../../src/sync/connectors/zoho.js");
    const contacts = [];
    for await (const c of ZohoConnector.fetchContacts("token", "https://www.zohoapis.com")) {
      contacts.push(c);
    }
    expect(contacts.length).toBe(2);
    const secondCallUrl = vi.mocked(fetch).mock.calls[1]![0] as string;
    expect(secondCallUrl).toContain("page=2");
  });

  it("yields activities from API response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "za1",
            Activity_Type: "Call",
            Subject: "Demo",
            Description: "Product demo",
            Due_Date: "2026-05-10",
            Who_Id: { id: "z1" },
          },
        ],
        info: { more_records: false },
      }),
    } as Response);

    const { ZohoConnector } = await import("../../src/sync/connectors/zoho.js");
    const activities = [];
    for await (const a of ZohoConnector.fetchActivities("token", "https://www.zohoapis.com")) {
      activities.push(a);
    }
    expect(activities.length).toBe(1);
    expect(activities[0]!.type).toBe("Call");
    expect(activities[0]!.subject).toBe("Demo");
    expect(activities[0]!.date).toBe("2026-05-10");
    expect(activities[0]!.contactId).toBe("z1");
  });

  it("stops on non-OK response for activities", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 403 } as Response);

    const { ZohoConnector } = await import("../../src/sync/connectors/zoho.js");
    const activities = [];
    for await (const a of ZohoConnector.fetchActivities("bad", "https://www.zohoapis.com")) {
      activities.push(a);
    }
    expect(activities.length).toBe(0);
  });

  it("uses 'Other' type and 'Unknown' name when fields missing", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: "z99" }],
          info: { more_records: false },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: "za99" }],
          info: { more_records: false },
        }),
      } as Response);

    const { ZohoConnector } = await import("../../src/sync/connectors/zoho.js");
    const contacts = [];
    for await (const c of ZohoConnector.fetchContacts("token", "https://www.zohoapis.com")) {
      contacts.push(c);
    }
    expect(contacts[0]!.name).toBe("Unknown");

    const activities = [];
    for await (const a of ZohoConnector.fetchActivities("token", "https://www.zohoapis.com")) {
      activities.push(a);
    }
    expect(activities[0]!.type).toBe("Other");
  });
});
