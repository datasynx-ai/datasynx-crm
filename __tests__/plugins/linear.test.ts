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

const LINEAR_TOKEN = "lin_api_abc123";

const ISSUES_RESPONSE = {
  data: {
    issues: {
      nodes: [
        {
          id: "issue-1",
          title: "Acme Corp: Fix login bug",
          state: { name: "In Progress" },
          priority: 1,
          assignee: { name: "Alice" },
          createdAt: "2026-05-01T10:00:00Z",
        },
        {
          id: "issue-2",
          title: "Acme Corp: Improve dashboard",
          state: { name: "Todo" },
          priority: 2,
          assignee: undefined,
          createdAt: "2026-05-05T14:00:00Z",
        },
      ],
    },
  },
};

const ISSUES_EMPTY = { data: { issues: { nodes: [] } } };

function jsonRes(data: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(data) };
}

describe("fetchLinearIssuesByCustomer", () => {
  it("returns issues array on success", async () => {
    fetchMock.mockResolvedValue(jsonRes(ISSUES_RESPONSE));
    const { fetchLinearIssuesByCustomer } = await import("../../src/plugins/linear.js");
    const issues = await fetchLinearIssuesByCustomer(LINEAR_TOKEN, "Acme Corp");
    expect(issues).toHaveLength(2);
    expect(issues[0]!.id).toBe("issue-1");
    expect(issues[0]!.state.name).toBe("In Progress");
    expect(issues[1]!.assignee).toBeUndefined();
  });

  it("returns empty array when no issues found", async () => {
    fetchMock.mockResolvedValue(jsonRes(ISSUES_EMPTY));
    const { fetchLinearIssuesByCustomer } = await import("../../src/plugins/linear.js");
    const issues = await fetchLinearIssuesByCustomer(LINEAR_TOKEN, "Unknown Corp");
    expect(issues).toEqual([]);
  });

  it("returns empty array on API error", async () => {
    fetchMock.mockResolvedValue(jsonRes({}, false));
    const { fetchLinearIssuesByCustomer } = await import("../../src/plugins/linear.js");
    const issues = await fetchLinearIssuesByCustomer(LINEAR_TOKEN, "Error Corp");
    expect(issues).toEqual([]);
  });
});

describe("handleGetLinearIssues", () => {
  it("uses provided customerName if given", async () => {
    fetchMock.mockResolvedValue(jsonRes(ISSUES_RESPONSE));
    const { handleGetLinearIssues } = await import("../../src/plugins/linear.js");
    const result = await handleGetLinearIssues(
      { slug: "acme-corp", customerName: "Acme Corp" },
      "/data",
      LINEAR_TOKEN
    );
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      success: boolean;
      issues: unknown[];
    };
    expect(parsed.success).toBe(true);
    expect(parsed.issues).toHaveLength(2);

    // Verify the GraphQL call used "Acme Corp"
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as {
      variables: { filter: string };
    };
    expect(body.variables.filter).toBe("Acme Corp");
  });

  it("reads name from main_facts via dynamic import when customerName not provided", async () => {
    // Mock the fs module so readMainFacts can work with memfs
    vi.mock("../../src/fs/customer-dir.js", () => ({
      readMainFacts: vi.fn().mockResolvedValue({ name: "Acme Corporation", slug: "acme-corp" }),
    }));

    fetchMock.mockResolvedValue(jsonRes(ISSUES_RESPONSE));
    const { handleGetLinearIssues } = await import("../../src/plugins/linear.js");
    const result = await handleGetLinearIssues(
      { slug: "acme-corp" },
      "/data",
      LINEAR_TOKEN
    );
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      success: boolean;
    };
    expect(parsed.success).toBe(true);
  });
});
