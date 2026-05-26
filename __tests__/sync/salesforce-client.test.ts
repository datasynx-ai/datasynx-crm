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

const CONTACTS_RESPONSE = {
  records: [
    { Id: "c001", Name: "Alice Smith", Email: "alice@acme.com", Account: { Website: "https://acme.com" } },
    { Id: "c002", Name: "Bob Jones", Email: "bob@beta.de", Account: { Website: "https://beta.de" } },
  ],
  totalSize: 2,
  done: true,
};

const TASKS_RESPONSE = {
  records: [
    { Id: "t001", Subject: "Call with Alice", Description: "Discussed renewal", ActivityDate: "2026-05-01", Type: "Call", WhoId: "c001" },
    { Id: "t002", Subject: "Email", Description: "Sent proposal", ActivityDate: "2026-05-02", Type: "Email", WhoId: "c001" },
  ],
  totalSize: 2,
  done: true,
};

describe("fetchSalesforceContacts", () => {
  it("returns parsed contacts", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(CONTACTS_RESPONSE) });
    const { fetchSalesforceContacts } = await import("../../src/sync/salesforce-client.js");

    const contacts = await fetchSalesforceContacts("https://myco.salesforce.com", "tok_test");

    expect(contacts).toHaveLength(2);
    expect(contacts[0]!.Name).toBe("Alice Smith");
    expect(contacts[0]!.Email).toBe("alice@acme.com");
    expect(contacts[0]!.Account?.Website).toBe("https://acme.com");
  });

  it("sends correct Authorization header", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(CONTACTS_RESPONSE) });
    const { fetchSalesforceContacts } = await import("../../src/sync/salesforce-client.js");

    await fetchSalesforceContacts("https://myco.salesforce.com", "my_token");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("myco.salesforce.com"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer my_token" }) })
    );
  });

  it("throws on API error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" });
    const { fetchSalesforceContacts } = await import("../../src/sync/salesforce-client.js");

    await expect(fetchSalesforceContacts("https://myco.salesforce.com", "bad")).rejects.toThrow(/401/);
  });
});

describe("fetchSalesforceTasks", () => {
  it("returns parsed tasks", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(TASKS_RESPONSE) });
    const { fetchSalesforceTasks } = await import("../../src/sync/salesforce-client.js");

    const tasks = await fetchSalesforceTasks("https://myco.salesforce.com", "tok_test");

    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.Subject).toBe("Call with Alice");
    expect(tasks[0]!.WhoId).toBe("c001");
    expect(tasks[1]!.Type).toBe("Email");
  });

  it("throws on API error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" });
    const { fetchSalesforceTasks } = await import("../../src/sync/salesforce-client.js");

    await expect(fetchSalesforceTasks("https://myco.salesforce.com", "bad")).rejects.toThrow(/403/);
  });
});
