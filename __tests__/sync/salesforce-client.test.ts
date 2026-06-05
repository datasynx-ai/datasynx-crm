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

describe("fetchSalesforceContacts — pagination", () => {
  it("follows nextRecordsUrl across pages", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [{ Id: "c1", Name: "A" }],
            totalSize: 2,
            done: false,
            nextRecordsUrl: "/services/data/v58.0/query/01g-2000",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ records: [{ Id: "c2", Name: "B" }], totalSize: 2, done: true }),
      });
    const { fetchSalesforceContacts } = await import("../../src/sync/salesforce-client.js");
    const contacts = await fetchSalesforceContacts("https://myco.salesforce.com", "tok");
    expect(contacts).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0] as string).toContain("/services/data/v58.0/query/01g-2000");
  });
});

describe("fetchSalesforceTasks — pagination", () => {
  it("follows nextRecordsUrl across pages", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [{ Id: "t1", Subject: "One" }],
            totalSize: 2,
            done: false,
            nextRecordsUrl: "/services/data/v58.0/query/01g-3000",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ records: [{ Id: "t2", Subject: "Two" }], totalSize: 2, done: true }),
      });
    const { fetchSalesforceTasks } = await import("../../src/sync/salesforce-client.js");
    const tasks = await fetchSalesforceTasks("https://myco.salesforce.com", "tok");
    expect(tasks).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("fetchSalesforceLeads", () => {
  it("returns parsed leads and paginates", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [
              {
                Id: "l1",
                Name: "Jane Doe",
                Company: "Globex",
                Email: "jane@globex.com",
                Status: "Open - Not Contacted",
                Title: "CTO",
                Website: "https://globex.com",
              },
            ],
            totalSize: 2,
            done: false,
            nextRecordsUrl: "/services/data/v58.0/query/01g-4000",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [{ Id: "l2", Name: "John Roe", Company: "Initech" }],
            totalSize: 2,
            done: true,
          }),
      });
    const { fetchSalesforceLeads } = await import("../../src/sync/salesforce-client.js");
    const leads = await fetchSalesforceLeads("https://myco.salesforce.com", "tok");
    expect(leads).toHaveLength(2);
    expect(leads[0]!.Company).toBe("Globex");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("fetchSalesforceEvents", () => {
  it("returns parsed events and paginates", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [
              {
                Id: "e1",
                Subject: "Discovery call",
                Description: "Intro meeting",
                StartDateTime: "2026-05-10T14:00:00Z",
                ActivityDate: "2026-05-10",
                WhoId: "c001",
                WhatId: "a001",
              },
            ],
            totalSize: 2,
            done: false,
            nextRecordsUrl: "/services/data/v58.0/query/01g-5000",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ records: [{ Id: "e2", Subject: "Demo" }], totalSize: 2, done: true }),
      });
    const { fetchSalesforceEvents } = await import("../../src/sync/salesforce-client.js");
    const events = await fetchSalesforceEvents("https://myco.salesforce.com", "tok");
    expect(events).toHaveLength(2);
    expect(events[0]!.Subject).toBe("Discovery call");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("fetchSalesforceCases", () => {
  it("returns parsed cases and paginates", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [
              {
                Id: "case1",
                CaseNumber: "00001023",
                Subject: "Login broken",
                Description: "User cannot log in",
                Status: "Working",
                Priority: "High",
                Account: { Name: "Acme Corp" },
                CreatedDate: "2026-04-01T09:00:00Z",
              },
            ],
            totalSize: 2,
            done: false,
            nextRecordsUrl: "/services/data/v58.0/query/01g-6000",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ records: [{ Id: "case2", Subject: "Bug" }], totalSize: 2, done: true }),
      });
    const { fetchSalesforceCases } = await import("../../src/sync/salesforce-client.js");
    const cases = await fetchSalesforceCases("https://myco.salesforce.com", "tok");
    expect(cases).toHaveLength(2);
    expect(cases[0]!.Subject).toBe("Login broken");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("fetchSalesforceLineItems", () => {
  it("returns parsed opportunity line items and paginates", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [
              {
                Id: "oli1",
                OpportunityId: "o001",
                Quantity: 10,
                UnitPrice: 100,
                TotalPrice: 1000,
                Product2: { Name: "Enterprise Seat" },
              },
            ],
            totalSize: 2,
            done: false,
            nextRecordsUrl: "/services/data/v58.0/query/01g-7000",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [{ Id: "oli2", OpportunityId: "o001", Quantity: 1, UnitPrice: 500 }],
            totalSize: 2,
            done: true,
          }),
      });
    const { fetchSalesforceLineItems } = await import("../../src/sync/salesforce-client.js");
    const items = await fetchSalesforceLineItems("https://myco.salesforce.com", "tok");
    expect(items).toHaveLength(2);
    expect(items[0]!.Product2?.Name).toBe("Enterprise Seat");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("fetchSalesforceNotes", () => {
  it("returns parsed notes and paginates", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [
              {
                Id: "note1",
                Title: "Renewal terms",
                Body: "Customer wants annual billing.",
                ParentId: "c001",
                CreatedDate: "2026-03-01T10:00:00Z",
              },
            ],
            totalSize: 2,
            done: false,
            nextRecordsUrl: "/services/data/v58.0/query/01g-8000",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ records: [{ Id: "note2", Title: "X" }], totalSize: 2, done: true }),
      });
    const { fetchSalesforceNotes } = await import("../../src/sync/salesforce-client.js");
    const notes = await fetchSalesforceNotes("https://myco.salesforce.com", "tok");
    expect(notes).toHaveLength(2);
    expect(notes[0]!.Title).toBe("Renewal terms");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("fetchSalesforceUsers", () => {
  it("returns parsed users and paginates", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [{ Id: "u1", Name: "Sara Rep", Email: "sara@myco.com", IsActive: true }],
            totalSize: 2,
            done: false,
            nextRecordsUrl: "/services/data/v58.0/query/01g-u000",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [{ Id: "u2", Name: "Tom Lead", Email: "tom@myco.com", IsActive: false }],
            totalSize: 2,
            done: true,
          }),
      });
    const { fetchSalesforceUsers } = await import("../../src/sync/salesforce-client.js");
    const users = await fetchSalesforceUsers("https://myco.salesforce.com", "tok");
    expect(users).toHaveLength(2);
    expect(users[0]!.Name).toBe("Sara Rep");
    expect(users[0]!.Email).toBe("sara@myco.com");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0] as string).toContain("FROM+User");
  });

  it("throws on non-OK response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" });
    const { fetchSalesforceUsers } = await import("../../src/sync/salesforce-client.js");
    await expect(fetchSalesforceUsers("https://myco.salesforce.com", "tok")).rejects.toThrow(
      "Salesforce API error"
    );
  });
});

describe("fetchSalesforceAccounts", () => {
  it("returns parsed accounts with ParentId and paginates", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [
              {
                Id: "a1",
                Name: "Acme Subsidiary",
                ParentId: "a0",
                Website: "https://sub.acme.com",
                OwnerId: "u1",
              },
            ],
            totalSize: 2,
            done: false,
            nextRecordsUrl: "/services/data/v58.0/query/01g-a000",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [{ Id: "a0", Name: "Acme Corp" }],
            totalSize: 2,
            done: true,
          }),
      });
    const { fetchSalesforceAccounts } = await import("../../src/sync/salesforce-client.js");
    const accounts = await fetchSalesforceAccounts("https://myco.salesforce.com", "tok");
    expect(accounts).toHaveLength(2);
    expect(accounts[0]!.Name).toBe("Acme Subsidiary");
    expect(accounts[0]!.ParentId).toBe("a0");
    expect(fetchMock.mock.calls[0]![0] as string).toContain("FROM+Account");
  });
});

describe("describeSalesforceObject", () => {
  it("fetches the describe metadata for an object", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          name: "Account",
          fields: [
            { name: "Name", label: "Account Name", type: "string", custom: false },
            {
              name: "Industry_Segment__c",
              label: "Industry Segment",
              type: "picklist",
              custom: true,
            },
          ],
        }),
    });
    const { describeSalesforceObject } = await import("../../src/sync/salesforce-client.js");
    const fields = await describeSalesforceObject("https://myco.salesforce.com", "tok", "Account");
    expect(fields).toHaveLength(2);
    expect(fetchMock.mock.calls[0]![0] as string).toContain("/sobjects/Account/describe");
  });

  it("throws on non-OK response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" });
    const { describeSalesforceObject } = await import("../../src/sync/salesforce-client.js");
    await expect(
      describeSalesforceObject("https://myco.salesforce.com", "tok", "Account")
    ).rejects.toThrow("Salesforce API error");
  });
});

describe("fetchSalesforceCustomFields", () => {
  it("returns only the custom (__c) fields with name and label", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          name: "Account",
          fields: [
            { name: "Name", label: "Account Name", type: "string", custom: false },
            {
              name: "Industry_Segment__c",
              label: "Industry Segment",
              type: "picklist",
              custom: true,
            },
            { name: "Health_Score__c", label: "Health Score", type: "double", custom: true },
          ],
        }),
    });
    const { fetchSalesforceCustomFields } = await import("../../src/sync/salesforce-client.js");
    const custom = await fetchSalesforceCustomFields(
      "https://myco.salesforce.com",
      "tok",
      "Account"
    );
    expect(custom).toHaveLength(2);
    expect(custom.map((f) => f.name)).toEqual(["Industry_Segment__c", "Health_Score__c"]);
    expect(custom[0]!.label).toBe("Industry Segment");
  });
});

describe("fetchSalesforceRecords", () => {
  it("builds a SOQL query from the given fields and returns records", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          records: [{ Id: "a1", Industry_Segment__c: "SaaS", Health_Score__c: 92 }],
          totalSize: 1,
          done: true,
        }),
    });
    const { fetchSalesforceRecords } = await import("../../src/sync/salesforce-client.js");
    const records = await fetchSalesforceRecords("https://myco.salesforce.com", "tok", "Account", [
      "Id",
      "Industry_Segment__c",
      "Health_Score__c",
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]!["Industry_Segment__c"]).toBe("SaaS");
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain("SELECT+Id,Industry_Segment__c,Health_Score__c+FROM+Account");
  });
});

describe("fetchSalesforceAttachments", () => {
  it("returns parsed attachments and paginates", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [
              {
                Id: "att1",
                Name: "contract.pdf",
                ParentId: "a1",
                ContentType: "application/pdf",
                BodyLength: 1024,
              },
            ],
            totalSize: 2,
            done: false,
            nextRecordsUrl: "/services/data/v58.0/query/01g-att0",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [{ Id: "att2", Name: "logo.png", ParentId: "a1" }],
            totalSize: 2,
            done: true,
          }),
      });
    const { fetchSalesforceAttachments } = await import("../../src/sync/salesforce-client.js");
    const atts = await fetchSalesforceAttachments("https://myco.salesforce.com", "tok");
    expect(atts).toHaveLength(2);
    expect(atts[0]!.Name).toBe("contract.pdf");
    expect(atts[0]!.ParentId).toBe("a1");
    expect(fetchMock.mock.calls[0]![0] as string).toContain("FROM+Attachment");
  });
});

describe("downloadSalesforceAttachment", () => {
  it("downloads the binary body and returns a Buffer", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    });
    const { downloadSalesforceAttachment } = await import("../../src/sync/salesforce-client.js");
    const buf = await downloadSalesforceAttachment("https://myco.salesforce.com", "tok", "att1");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf).toHaveLength(4);
    expect([...buf]).toEqual([1, 2, 3, 4]);
    expect(fetchMock.mock.calls[0]![0] as string).toContain("/sobjects/Attachment/att1/Body");
  });

  it("throws on non-OK response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" });
    const { downloadSalesforceAttachment } = await import("../../src/sync/salesforce-client.js");
    await expect(
      downloadSalesforceAttachment("https://myco.salesforce.com", "tok", "att1")
    ).rejects.toThrow("Salesforce API error");
  });
});

describe("fetchSalesforceCampaignMembers", () => {
  it("returns parsed campaign members and paginates", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [
              {
                Id: "cm1",
                CampaignId: "camp1",
                Campaign: { Name: "Q3 Webinar" },
                ContactId: "c001",
                Status: "Responded",
              },
            ],
            totalSize: 2,
            done: false,
            nextRecordsUrl: "/services/data/v58.0/query/01g-9000",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            records: [{ Id: "cm2", CampaignId: "camp1" }],
            totalSize: 2,
            done: true,
          }),
      });
    const { fetchSalesforceCampaignMembers } = await import("../../src/sync/salesforce-client.js");
    const members = await fetchSalesforceCampaignMembers("https://myco.salesforce.com", "tok");
    expect(members).toHaveLength(2);
    expect(members[0]!.Campaign?.Name).toBe("Q3 Webinar");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
