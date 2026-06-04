import { readMainFacts, writeMainFacts } from "../fs/customer-dir.js";
import { getSecret as vaultGetSecret } from "./vault.js";

/**
 * Enrichment layer (domino D15 / C6): a pluggable, vault-backed way to fill in
 * missing customer facts (domain, industry, contact info). The package ships an
 * offline built-in (derive domain from an email) and a provider interface so
 * external data providers can be added as plugins. Provider API keys come from
 * the D12 vault via the context — never from the markdown. Enrichment only fills
 * gaps; it never overwrites human-entered facts.
 */
export interface EnrichmentData {
  domain?: string;
  email?: string;
  phone?: string;
  industry?: string;
}

export interface EnrichmentContext {
  /** Look up a provider credential from the local vault (or env). */
  getSecret(name: string): string | undefined;
}

export interface EnrichmentInput extends EnrichmentData {
  name: string;
}

export interface EnrichmentProvider {
  name: string;
  enrich(input: EnrichmentInput, ctx: EnrichmentContext): Promise<EnrichmentData> | EnrichmentData;
}

const ENRICHABLE: Array<keyof EnrichmentData> = ["domain", "email", "phone", "industry"];

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

/** Merge additions into base, only filling fields that are currently empty. */
export function mergeEnrichment(base: EnrichmentData, additions: EnrichmentData): EnrichmentData {
  const out: EnrichmentData = { ...base };
  for (const key of ENRICHABLE) {
    const incoming = additions[key];
    if (isEmpty(out[key]) && incoming !== undefined && incoming.trim() !== "") out[key] = incoming;
  }
  return out;
}

/** Built-in, offline provider: derive a company domain from a contact email. */
export const domainFromEmailProvider: EnrichmentProvider = {
  name: "domain-from-email",
  enrich(input) {
    const email = input.email ?? "";
    const at = email.indexOf("@");
    if (at > 0 && at < email.length - 1) {
      const domain = email
        .slice(at + 1)
        .trim()
        .toLowerCase();
      if (domain) return { domain };
    }
    return {};
  },
};

export const DEFAULT_PROVIDERS: EnrichmentProvider[] = [domainFromEmailProvider];

/** Run providers in order, merging their output into the input (gaps only). */
export async function runEnrichment(
  input: EnrichmentInput,
  providers: EnrichmentProvider[],
  ctx: EnrichmentContext
): Promise<EnrichmentData> {
  let data: EnrichmentData = {
    ...(input.domain !== undefined ? { domain: input.domain } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.industry !== undefined ? { industry: input.industry } : {}),
  };
  for (const provider of providers) {
    const additions = await provider.enrich({ ...data, name: input.name }, ctx);
    data = mergeEnrichment(data, additions);
  }
  return data;
}

export interface EnrichResult {
  /** Fields newly added by enrichment (i.e. previously empty). */
  applied: EnrichmentData;
  /** The full merged enrichment data. */
  merged: EnrichmentData;
  written: boolean;
}

function vaultContext(dataDir: string): EnrichmentContext {
  const key = process.env["DXCRM_VAULT_KEY"];
  if (!key) return { getSecret: (n) => process.env[n] };
  return {
    getSecret(name: string) {
      try {
        return vaultGetSecret(dataDir, key, name) ?? process.env[name];
      } catch {
        return process.env[name];
      }
    },
  };
}

/**
 * Enrich one customer: read main_facts, run providers, and (optionally) write
 * the newly-filled fields back. Existing human-entered facts are preserved.
 */
export async function enrichCustomer(
  dataDir: string,
  slug: string,
  opts: { providers?: EnrichmentProvider[]; write?: boolean; ctx?: EnrichmentContext } = {}
): Promise<EnrichResult> {
  const facts = await readMainFacts(dataDir, slug);
  const providers = opts.providers ?? DEFAULT_PROVIDERS;
  const ctx = opts.ctx ?? vaultContext(dataDir);

  const before: EnrichmentData = {
    ...(facts.domain !== undefined ? { domain: facts.domain } : {}),
    ...(facts.email !== undefined ? { email: facts.email } : {}),
    ...(facts.phone !== undefined ? { phone: facts.phone } : {}),
    ...(facts.industry !== undefined ? { industry: facts.industry } : {}),
  };
  const merged = await runEnrichment({ name: facts.name, ...before }, providers, ctx);

  const applied: EnrichmentData = {};
  for (const key of ENRICHABLE) {
    const value = merged[key];
    if (isEmpty(before[key]) && value !== undefined && value.trim() !== "") applied[key] = value;
  }

  let written = false;
  if (opts.write && Object.keys(applied).length > 0) {
    await writeMainFacts(dataDir, slug, {
      ...facts,
      ...applied,
      updated: new Date().toISOString().slice(0, 10),
    });
    written = true;
  }

  return { applied, merged, written };
}
