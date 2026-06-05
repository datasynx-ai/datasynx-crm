// src/sync/email-router.ts
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { listCustomerSlugs } from "../fs/customer-dir.js";

export interface CustomerRoutingInfo {
  slug: string;
  /** Lowercased domains that identify this customer (e.g. "acme.com"). */
  domains: string[];
  /** Lowercased full email addresses that identify this customer. */
  emails: string[];
}

/** Extract the bare email address from a header value like `"Name <a@b.com>"`. */
export function extractEmailAddress(headerValue: string): string {
  const angle = headerValue.match(/<([^>]+)>/);
  const raw = (angle ? angle[1] : headerValue) ?? "";
  return raw.trim().toLowerCase();
}

/** The domain part of an email address, lowercased (empty string if malformed). */
export function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0
    ? email
        .slice(at + 1)
        .trim()
        .toLowerCase()
    : "";
}

/**
 * Split a header that may contain several comma-separated addresses
 * (To/Cc) into individual lowercased email addresses.
 */
export function parseAddressList(headerValue: string | undefined): string[] {
  if (!headerValue) return [];
  return headerValue
    .split(",")
    .map((part) => extractEmailAddress(part))
    .filter((a) => a.includes("@"));
}

/** Read just the routing-relevant fields from a customer's main_facts (tolerant). */
function readRoutingFields(
  dataDir: string,
  slug: string
): {
  domain?: string | undefined;
  email?: string | undefined;
  primary_contact?: string | undefined;
} {
  const file = path.join(dataDir, "customers", slug, "main_facts.md");
  if (!fs.existsSync(file)) return {};
  try {
    const data = matter(fs.readFileSync(file, "utf-8")).data as Record<string, unknown>;
    return {
      domain: typeof data["domain"] === "string" ? data["domain"] : undefined,
      email: typeof data["email"] === "string" ? data["email"] : undefined,
      primary_contact:
        typeof data["primary_contact"] === "string" ? data["primary_contact"] : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Build the routing table from every customer's main_facts. A customer is
 * identified by its `domain`, `email`, and `primary_contact` (when it looks
 * like an email). Customers without any identifier are still listed (empty
 * arrays) so callers can see them, but they never match.
 */
export function buildRoutingTable(dataDir: string): CustomerRoutingInfo[] {
  return listCustomerSlugs(dataDir).map((slug) => {
    const facts = readRoutingFields(dataDir, slug);
    const domains = new Set<string>();
    const emails = new Set<string>();
    if (facts.domain) domains.add(facts.domain.trim().toLowerCase());
    for (const candidate of [facts.email, facts.primary_contact]) {
      if (candidate && candidate.includes("@")) {
        const addr = candidate.trim().toLowerCase();
        emails.add(addr);
        const d = domainOf(addr);
        if (d) domains.add(d);
      }
    }
    return { slug, domains: [...domains], emails: [...emails] };
  });
}

/**
 * Route a message to a customer slug by matching any of its addresses
 * (from/to/cc) against the routing table. Exact email matches win over domain
 * matches. Returns the matched slug, or null when nothing matches (the message
 * is "unrouted").
 */
export function routeMessage(addresses: string[], table: CustomerRoutingInfo[]): string | null {
  const addrs = addresses.map((a) => a.trim().toLowerCase()).filter((a) => a.includes("@"));
  if (addrs.length === 0) return null;
  const domains = new Set(addrs.map(domainOf).filter(Boolean));

  // Pass 1: exact email match (most specific).
  for (const c of table) {
    if (c.emails.some((e) => addrs.includes(e))) return c.slug;
  }
  // Pass 2: domain match.
  for (const c of table) {
    if (c.domains.some((d) => domains.has(d))) return c.slug;
  }
  return null;
}
