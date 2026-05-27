import type { DxcrmPlugin } from "../core/plugin-registry.js";

const LINEAR_API = "https://api.linear.app/graphql";

export interface LinearIssue {
  id: string;
  title: string;
  state: { name: string };
  priority: number;
  assignee?: { name: string };
  createdAt: string;
}

export async function fetchLinearIssuesByCustomer(
  token: string,
  customerName: string
): Promise<LinearIssue[]> {
  const query = `
    query IssuesByCustomer($filter: String!) {
      issues(filter: { title: { containsIgnoreCase: $filter } }, first: 50) {
        nodes { id title state { name } priority assignee { name } createdAt }
      }
    }
  `;
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { filter: customerName } }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    data?: { issues?: { nodes: LinearIssue[] } };
  };
  return data?.data?.issues?.nodes ?? [];
}

export async function handleGetLinearIssues(
  input: { slug: string; customerName?: string },
  dataDir: string,
  linearToken: string
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  let name = input.customerName ?? input.slug;
  if (!input.customerName) {
    try {
      const { readMainFacts } = await import("../fs/customer-dir.js");
      const facts = await readMainFacts(dataDir, input.slug);
      name = ((facts as Record<string, unknown>)["name"] as string | undefined) ?? name;
    } catch {
      // use slug as fallback
    }
  }

  const issues = await fetchLinearIssuesByCustomer(linearToken, name);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true, slug: input.slug, issues }, null, 2),
      },
    ],
  };
}

export function createLinearPlugin(linearToken: string): DxcrmPlugin {
  void linearToken;
  return {
    name: "linear",
    version: "1.0.0",
    description: "Linear issue tracking context for CRM customers",
    mcpTools: ["get_linear_issues"],
  };
}
