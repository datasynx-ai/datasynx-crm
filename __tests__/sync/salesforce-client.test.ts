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
    {
      Id: "c001",
      Name: "Alice Smith",
      Email: "alice@acme.com",
      Account: { Website: "https://acme.com" },
    },
    {
      Id: "c002",
      Name: "Bob Jones",
      Email: "bob@beta.de",
      Account: { Website: "https://beta.de" },
    },
  ],
  totalSize: 2,
  done: true,
};

const TASKS_RESPONSE = {
  records: [
    {
      Id: "t001",
      Subject: "Call with Alice",
      Description: "Discussed renewal",
      ActivityDate: "2026-05-01",
      Type: "Call",
      WhoId: "c001",
    },
    {
      Id: "t002",
      Subject: "Email",
      Description: "Sent proposal",
      ActivityDate: "2026-05-02",
      Type: "Email",
      WhoId: "c001",
    },
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
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer my_token" }),
      })
    );
  });

  it("throws on API error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" });
    const { fetchSalesforceContacts } = await import("../../src/sync/salesforce-client.js");

    await expect(fetchSalesforceContacts("https://myco.salesforce.com", "bad")).rejects.toThrow(
      /401/
    );
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

describe("createBulkJob", () => {
  it("posts to bulk query endpoint and returns job id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "job_001", state: "Open" }),
    });
    const { createBulkJob } = await import("../../src/sync/salesforce-client.js");

    const jobId = await createBulkJob(
      "https://myco.salesforce.com",
      "tok",
      "SELECT Id FROM Contact"
    );

    expect(jobId).toBe("job_001");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("jobs/query"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws on non-OK response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400 });
    const { createBulkJob } = await import("../../src/sync/salesforce-client.js");

    await expect(
      createBulkJob("https://myco.salesforce.com", "tok", "SELECT Id FROM Contact")
    ).rejects.toThrow("Salesforce Bulk API error");
  });
});

describe("pollBulkJob", () => {
  it("returns job status", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "job_001", state: "JobComplete" }),
    });
    const { pollBulkJob } = await import("../../src/sync/salesforce-client.js");

    const status = await pollBulkJob("https://myco.salesforce.com", "tok", "job_001");

    expect(status.id).toBe("job_001");
    expect(status.state).toBe("JobComplete");
  });

  it("throws on non-OK response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const { pollBulkJob } = await import("../../src/sync/salesforce-client.js");

    await expect(pollBulkJob("https://myco.salesforce.com", "tok", "bad_job")).rejects.toThrow(
      "Salesforce Bulk poll error"
    );
  });
});

describe("fetchBulkResults", () => {
  it("yields CSV chunks from results endpoint", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("Id,Name\nc001,Alice"),
      headers: { get: () => null },
    });
    const { fetchBulkResults } = await import("../../src/sync/salesforce-client.js");

    const chunks = [];
    for await (const chunk of fetchBulkResults("https://myco.salesforce.com", "tok", "job_001")) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("Alice");
  });

  it("follows locator pagination", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("Id,Name\nc001,Alice"),
        headers: { get: (h: string) => (h === "Sforce-Locator" ? "locator_abc" : null) },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("Id,Name\nc002,Bob"),
        headers: { get: () => null },
      });

    const { fetchBulkResults } = await import("../../src/sync/salesforce-client.js");
    const chunks = [];
    for await (const chunk of fetchBulkResults("https://myco.salesforce.com", "tok", "job_001")) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    const secondCallUrl = fetchMock.mock.calls[1]![0] as string;
    expect(secondCallUrl).toContain("locator=locator_abc");
  });

  it("throws on non-OK response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const { fetchBulkResults } = await import("../../src/sync/salesforce-client.js");

    await expect(async () => {
      for await (const _ of fetchBulkResults("https://myco.salesforce.com", "tok", "job_001")) {
        /* noop */
      }
    }).rejects.toThrow("Salesforce Bulk results error");
  });
});

describe("fetchSalesforceOpportunities", () => {
  it("returns parsed opportunities", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          records: [
            {
              Id: "o001",
              Name: "Acme Enterprise License",
              StageName: "Proposal/Price Quote",
              Amount: 75000,
              CloseDate: "2026-09-30",
              Probability: 60,
              Account: { Name: "Acme Corp", Website: "https://acme.com" },
            },
          ],
          totalSize: 1,
          done: true,
        }),
    });
    const { fetchSalesforceOpportunities } = await import("../../src/sync/salesforce-client.js");
    const opps = await fetchSalesforceOpportunities("https://myco.salesforce.com", "tok");
    expect(opps).toHaveLength(1);
    expect(opps[0]!.Name).toBe("Acme Enterprise License");
    expect(opps[0]!.Account?.Name).toBe("Acme Corp");
  });

  it("follows nextRecordsUrl pagination across pages", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [{ Id: "o1", Name: "Deal 1", Account: { Name: "A" } }],
            totalSize: 2,
            done: false,
            nextRecordsUrl: "/services/data/v58.0/query/01g000-2000",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [{ Id: "o2", Name: "Deal 2", Account: { Name: "B" } }],
            totalSize: 2,
            done: true,
          }),
      });
    const { fetchSalesforceOpportunities } = await import("../../src/sync/salesforce-client.js");
    const opps = await fetchSalesforceOpportunities("https://myco.salesforce.com", "tok");
    expect(opps).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = fetchMock.mock.calls[1]![0] as string;
    expect(secondUrl).toContain("/services/data/v58.0/query/01g000-2000");
  });

  it("throws on non-OK response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" });
    const { fetchSalesforceOpportunities } = await import("../../src/sync/salesforce-client.js");
    await expect(
      fetchSalesforceOpportunities("https://myco.salesforce.com", "tok")
    ).rejects.toThrow("Salesforce API error");
  });
});
