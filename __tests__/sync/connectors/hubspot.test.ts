import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// --- Fixture data ---

const CONTACTS_PAGE_1 = {
  results: [
    {
      id: "1",
      properties: { firstname: "Alice", lastname: "Smith", email: "alice@acme.com", phone: "123", company: "Acme" },
    },
    {
      id: "2",
      properties: { firstname: "Bob", lastname: "Jones", email: "bob@beta.de", phone: "456", company: "Beta" },
    },
  ],
  paging: { next: { after: "cursor-abc" } },
};

const CONTACTS_PAGE_2 = {
  results: [
    {
      id: "3",
      properties: { firstname: "Carol", lastname: "White", email: "carol@gamma.io", phone: "", company: "Gamma" },
    },
  ],
  // no paging → last page
};

const CONTACTS_EMPTY = { results: [] };

const ASSOC_NOTES = {
  results: [{ toObjectId: 101 }],
  paging: undefined,
};

const NOTE_DETAIL = {
  id: "101",
  properties: { hs_note_body: "Great call", hs_timestamp: "2026-05-10T10:00:00Z" },
};

const ASSOC_CALLS = {
  results: [{ toObjectId: 201 }],
};

const CALL_DETAIL = {
  id: "201",
  properties: { hs_call_body: "Call transcript", hs_call_duration: "300", hs_timestamp: "2026-05-11T14:00:00Z" },
};

const ASSOC_EMAILS = {
  results: [{ toObjectId: 301 }],
};

const EMAIL_DETAIL = {
  id: "301",
  properties: { hs_email_subject: "Proposal", hs_email_text: "Please review", hs_timestamp: "2026-05-12T09:00:00Z" },
};

const ASSOC_MEETINGS = {
  results: [{ toObjectId: 401 }],
};

const MEETING_DETAIL = {
  id: "401",
  properties: {
    hs_meeting_title: "Demo Call",
    hs_meeting_body: "Showed product",
    hs_timestamp: "2026-05-13T15:00:00Z",
  },
};

const ASSOC_EMPTY = { results: [] };

function jsonRes(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}

// ---

describe("HubSpotConnector.fetchContacts", () => {
  it("yields correct CrmContact shape for a single page", async () => {
    fetchMock.mockResolvedValue(jsonRes(CONTACTS_PAGE_2));
    const { HubSpotConnector } = await import("../../../src/sync/connectors/hubspot.js");

    const contacts: import("../../../src/sync/connectors/index.js").CrmContact[] = [];
    for await (const c of HubSpotConnector.fetchContacts("tok", "")) {
      contacts.push(c);
    }

    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      id: "3",
      name: "Carol White",
      email: "carol@gamma.io",
      company: "Gamma",
    });
  });

  it("handles cursor pagination across 2 pages", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(CONTACTS_PAGE_1))
      .mockResolvedValueOnce(jsonRes(CONTACTS_PAGE_2));

    const { HubSpotConnector } = await import("../../../src/sync/connectors/hubspot.js");

    const contacts: import("../../../src/sync/connectors/index.js").CrmContact[] = [];
    for await (const c of HubSpotConnector.fetchContacts("tok", "")) {
      contacts.push(c);
    }

    expect(contacts).toHaveLength(3);
    expect(contacts[0]!.name).toBe("Alice Smith");
    expect(contacts[2]!.name).toBe("Carol White");
    // Second call should include the cursor
    expect(fetchMock.mock.calls[1]![0] as string).toContain("after=cursor-abc");
  });

  it("returns empty when no results", async () => {
    fetchMock.mockResolvedValue(jsonRes(CONTACTS_EMPTY));
    const { HubSpotConnector } = await import("../../../src/sync/connectors/hubspot.js");

    const contacts = [];
    for await (const c of HubSpotConnector.fetchContacts("tok", "")) {
      contacts.push(c);
    }
    expect(contacts).toHaveLength(0);
  });
});

describe("HubSpotConnector.fetchActivities", () => {
  it("calls associations endpoint then detail endpoint for notes", async () => {
    // Page 1 contacts, then page 2 empty, then assoc notes, calls (empty), emails (empty), meetings (empty)
    fetchMock
      .mockResolvedValueOnce(jsonRes({ results: [{ id: "1", properties: { firstname: "Alice", lastname: "", email: "a@b.com" } }] }))
      // notes assoc
      .mockResolvedValueOnce(jsonRes(ASSOC_NOTES))
      // note detail
      .mockResolvedValueOnce(jsonRes(NOTE_DETAIL))
      // calls assoc
      .mockResolvedValueOnce(jsonRes(ASSOC_EMPTY))
      // emails assoc
      .mockResolvedValueOnce(jsonRes(ASSOC_EMPTY))
      // meetings assoc
      .mockResolvedValueOnce(jsonRes(ASSOC_EMPTY));

    const { HubSpotConnector } = await import("../../../src/sync/connectors/hubspot.js");

    const activities: import("../../../src/sync/connectors/index.js").CrmActivity[] = [];
    for await (const a of HubSpotConnector.fetchActivities("tok", "")) {
      activities.push(a);
    }

    expect(activities).toHaveLength(1);
    expect(activities[0]!.type).toBe("Note");
    expect(activities[0]!.notes).toBe("Great call");
    expect(activities[0]!.id).toBe("hubspot-notes-101");
    expect(activities[0]!.date).toBe("2026-05-10");
  });

  it("maps all 4 activity types correctly (notes/calls/emails/meetings)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ results: [{ id: "1", properties: { firstname: "Alice", lastname: "" } }] }))
      // notes assoc
      .mockResolvedValueOnce(jsonRes(ASSOC_NOTES))
      .mockResolvedValueOnce(jsonRes(NOTE_DETAIL))
      // calls assoc
      .mockResolvedValueOnce(jsonRes(ASSOC_CALLS))
      .mockResolvedValueOnce(jsonRes(CALL_DETAIL))
      // emails assoc
      .mockResolvedValueOnce(jsonRes(ASSOC_EMAILS))
      .mockResolvedValueOnce(jsonRes(EMAIL_DETAIL))
      // meetings assoc
      .mockResolvedValueOnce(jsonRes(ASSOC_MEETINGS))
      .mockResolvedValueOnce(jsonRes(MEETING_DETAIL));

    const { HubSpotConnector } = await import("../../../src/sync/connectors/hubspot.js");

    const activities: import("../../../src/sync/connectors/index.js").CrmActivity[] = [];
    for await (const a of HubSpotConnector.fetchActivities("tok", "")) {
      activities.push(a);
    }

    expect(activities).toHaveLength(4);
    const types = activities.map((a) => a.type);
    expect(types).toContain("Note");
    expect(types).toContain("Call");
    expect(types).toContain("Email");
    expect(types).toContain("Meeting");

    const email = activities.find((a) => a.type === "Email")!;
    expect(email.subject).toBe("Proposal");
    expect(email.notes).toBe("Please review");

    const meeting = activities.find((a) => a.type === "Meeting")!;
    expect(meeting.subject).toBe("Demo Call");
  });

  it("429 retry: throws 429 on first attempt, second succeeds", async () => {
    // Contacts: one contact
    // The RateLimiter retries on any error, so a 429 response that throws will be retried.
    // We mock the first contacts call to return 429, second to succeed.
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce(jsonRes({ results: [{ id: "1", properties: { firstname: "Test", lastname: "" } }] }))
      // no activities
      .mockResolvedValueOnce(jsonRes(ASSOC_EMPTY))
      .mockResolvedValueOnce(jsonRes(ASSOC_EMPTY))
      .mockResolvedValueOnce(jsonRes(ASSOC_EMPTY))
      .mockResolvedValueOnce(jsonRes(ASSOC_EMPTY));

    const { HubSpotConnector } = await import("../../../src/sync/connectors/hubspot.js");

    const contacts = [];
    for await (const c of HubSpotConnector.fetchContacts("tok", "")) {
      contacts.push(c);
    }
    expect(contacts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // retry happened
  });
});
