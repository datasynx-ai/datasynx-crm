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

function makePerson(id: number) {
  return {
    id,
    name: `Person ${id}`,
    emails: [{ email: `person${id}@test.com` }],
    phone_numbers: [{ number: `+1${id}` }],
    company_name: "Test Co",
  };
}

function makeActivity(id: number) {
  return {
    id,
    type: { category: "call" },
    details: `Activity ${id}`,
    activity_date: 1700000000 + id,
  };
}

describe("makeCopperConnector — fetchContacts", () => {
  it("yields contacts from a single page", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [makePerson(1), makePerson(2)] }),
    });

    const { makeCopperConnector } = await import("../../../src/sync/connectors/copper.js");
    const connector = makeCopperConnector("user@test.com");

    const contacts = [];
    for await (const c of connector.fetchContacts("token123", "")) {
      contacts.push(c);
    }

    expect(contacts).toHaveLength(2);
    expect(contacts[0]).toMatchObject({ id: "1", name: "Person 1", email: "person1@test.com" });
    expect(contacts[1]).toMatchObject({ id: "2", name: "Person 2" });
  });

  it("paginates when page returns exactly 200 items", async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => makePerson(i + 1));
    const page2 = [makePerson(201), makePerson(202)];

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: page1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: page2 }) });

    const { makeCopperConnector } = await import("../../../src/sync/connectors/copper.js");
    const connector = makeCopperConnector("user@test.com");

    const contacts = [];
    for await (const c of connector.fetchContacts("token123", "")) {
      contacts.push(c);
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(contacts).toHaveLength(202);
  });

  it("stops pagination when page returns fewer than 200 items", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [makePerson(1)] }),
    });

    const { makeCopperConnector } = await import("../../../src/sync/connectors/copper.js");
    const connector = makeCopperConnector("user@test.com");

    const contacts = [];
    for await (const c of connector.fetchContacts("token123", "")) {
      contacts.push(c);
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(contacts).toHaveLength(1);
  });

  it("stops when page returns empty array", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const { makeCopperConnector } = await import("../../../src/sync/connectors/copper.js");
    const connector = makeCopperConnector("user@test.com");

    const contacts = [];
    for await (const c of connector.fetchContacts("token123", "")) {
      contacts.push(c);
    }

    expect(contacts).toHaveLength(0);
  });

  it("throws on non-ok API response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });

    const { makeCopperConnector } = await import("../../../src/sync/connectors/copper.js");
    const connector = makeCopperConnector("user@test.com");

    const gen = connector.fetchContacts("bad_token", "");
    await expect(gen.next()).rejects.toThrow("Copper API error: 401");
  });
});

describe("makeCopperConnector — fetchActivities", () => {
  it("yields activities from a single page", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [makeActivity(1), makeActivity(2)] }),
    });

    const { makeCopperConnector } = await import("../../../src/sync/connectors/copper.js");
    const connector = makeCopperConnector("user@test.com");

    const activities = [];
    for await (const a of connector.fetchActivities("token123", "")) {
      activities.push(a);
    }

    expect(activities).toHaveLength(2);
    expect(activities[0]).toMatchObject({ id: "1", type: "call" });
  });

  it("paginates activities when page returns exactly 200 items", async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => makeActivity(i + 1));
    const page2 = [makeActivity(201)];

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: page1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: page2 }) });

    const { makeCopperConnector } = await import("../../../src/sync/connectors/copper.js");
    const connector = makeCopperConnector("user@test.com");

    const activities = [];
    for await (const a of connector.fetchActivities("token123", "")) {
      activities.push(a);
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(activities).toHaveLength(201);
  });

  it("handles activity without date (activity_date undefined)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 99, type: { category: "email" }, details: "no date" }] }),
    });

    const { makeCopperConnector } = await import("../../../src/sync/connectors/copper.js");
    const connector = makeCopperConnector("user@test.com");

    const activities = [];
    for await (const a of connector.fetchActivities("token123", "")) {
      activities.push(a);
    }

    expect(activities[0]?.date).toBeUndefined();
  });

  it("throws on non-ok API response for activities", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });

    const { makeCopperConnector } = await import("../../../src/sync/connectors/copper.js");
    const connector = makeCopperConnector("user@test.com");

    const gen = connector.fetchActivities("bad_token", "");
    await expect(gen.next()).rejects.toThrow("Copper API error: 403");
  });
});
