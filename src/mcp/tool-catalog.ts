import { ALL_TOOLS } from "../setup/harness-content.js";

/**
 * Tool search (N1-5): rank the registered MCP tools by relevance to a query so
 * agents can discover the right tool without loading all 78 up front
 * (mitigates context overflow). Scoring favours exact name-token matches.
 */
export interface ToolMatch {
  name: string;
  score: number;
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function searchTools(query: string, limit = 5): ToolMatch[] {
  const qTokens = tokens(query);
  if (qTokens.length === 0) return [];

  const scored: ToolMatch[] = (ALL_TOOLS as readonly string[]).map((name) => {
    const nameTokens = tokens(name);
    const nameStr = name.toLowerCase();
    let score = 0;
    for (const q of qTokens) {
      if (nameTokens.includes(q)) score += 2;
      else if (nameStr.includes(q)) score += 1;
    }
    return { name, score };
  });

  return scored
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
