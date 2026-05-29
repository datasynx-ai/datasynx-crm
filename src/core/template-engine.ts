import { readMainFacts } from "../fs/customer-dir.js";

export type TemplateVariables = Record<string, string | number | undefined>;

const VARIABLE_REGEX = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

export function interpolate(template: string, vars: TemplateVariables): string {
  return template.replace(VARIABLE_REGEX, (match, key: string) => {
    const val = vars[key];
    return val !== undefined ? String(val) : match; // keep {{key}} if unresolved
  });
}

export function extractVariables(template: string): string[] {
  return [...template.matchAll(new RegExp(VARIABLE_REGEX.source, "g"))].map((m) => m[1]!);
}

export async function buildVariablesFromCustomer(
  dataDir: string,
  slug: string
): Promise<TemplateVariables> {
  const facts = await readMainFacts(dataDir, slug).catch(() => null);
  const now = new Date();
  return {
    company: facts?.name ?? slug,
    domain: facts?.domain ?? "",
    email: facts?.email ?? "",
    stage: facts?.relationship_stage ?? "",
    slug,
    date: now.toLocaleDateString("de-DE"),
    year: now.getFullYear(),
    month: now.toLocaleDateString("de-DE", { month: "long" }),
  };
}
