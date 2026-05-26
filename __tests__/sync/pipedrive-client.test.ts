import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

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

const PERSONS_RESPONSE = {
  data: [
    {
      id: 1,
      name: "Alice Smith",
      primary_email: "alice@acme.com",
      org_name: "Acme Corp",
      org_id: { value: 10 },
    },
    {
      id: 2,
      name: "Bob Jones",
      primary_email: "bob@beta.de",
      org_name: "Beta GmbH",
      org_id: { value: 20 },
    },
  ],
  additional_data: { pagination: { more_items_in_collection: false } },
};

const ACTIVITIES_RESPONSE = {
  data: [
    {
      id: 101,
      type: "call",
      subject: "Intro call",
      note: "Discussed needs",
      due_date: "2026-05-01",
      person_id: 1,
      org_id: 10,
    },
    {
      id: 102,
      type: "email",
      subject: "Follow-up",
      note: "Sent proposal",
      due_date: "2026-05-02",
      person_id: 1,
      org_id: 10,
    },
  ],
  additional_data: { pagination: { more_items_in_collection: false } },
};

describe("fetchPipedrivePersons", () => {
  it("returns parsed persons", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(PERSONS_RESPONSE) });
    const { fetchPipedrivePersons } = await import("../../src/sync/pipedrive-client.js");

    const persons = await fetchPipedrivePersons("https://myco.pipedrive.com", "tok_test");

    expect(persons).toHaveLength(2);
    expect(persons[0]!.name).toBe("Alice Smith");
    expect(persons[0]!.primary_email).toBe("alice@acme.com");
    expect(persons[0]!.org_name).toBe("Acme Corp");
  });

  it("sends Authorization header", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(PERSONS_RESPONSE) });
    const { fetchPipedrivePersons } = await import("../../src/sync/pipedrive-client.js");

    await fetchPipedrivePersons("https://myco.pipedrive.com", "my_token");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("pipedrive.com"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer my_token" }),
      })
    );
  });

  it("throws on API error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" });
    const { fetchPipedrivePersons } = await import("../../src/sync/pipedrive-client.js");

    await expect(fetchPipedrivePersons("https://myco.pipedrive.com", "bad")).rejects.toThrow(
      /401/
    );
  });
});

describe("fetchPipedriveActivities", () => {
  it("returns parsed activities", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(ACTIVITIES_RESPONSE) });
    const { fetchPipedriveActivities } = await import("../../src/sync/pipedrive-client.js");

    const activities = await fetchPipedriveActivities("https://myco.pipedrive.com", "tok_test");

    expect(activities).toHaveLength(2);
    expect(activities[0]!.subject).toBe("Intro call");
    expect(activities[0]!.type).toBe("call");
    expect(activities[0]!.person_id).toBe(1);
  });

  it("throws on API error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" });
    const { fetchPipedriveActivities } = await import("../../src/sync/pipedrive-client.js");

    await expect(
      fetchPipedriveActivities("https://myco.pipedrive.com", "bad")
    ).rejects.toThrow(/403/);
  });
});
