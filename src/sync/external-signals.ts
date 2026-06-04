// src/sync/external-signals.ts
// External signal detection: Hacker News (free), Crunchbase (key optional),
// Clearbit (key optional). Non-fatal on network errors — CRM works offline.
import https from "https";
import fs from "fs";
import path from "path";
import { writeJsonFile } from "../fs/json-store.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SignalType =
  | "funding_round"
  | "leadership_change"
  | "layoffs"
  | "acquisition"
  | "expansion"
  | "product_launch"
  | "news_mention";

export type SignalImpact = "positive" | "negative" | "neutral";

export interface ExternalSignal {
  id: string;
  slug: string;
  source: "hacker_news" | "crunchbase" | "clearbit" | "rss";
  type: SignalType;
  summary: string;
  url?: string;
  detectedAt: string;
  impact: SignalImpact;
}

// ─── File I/O ─────────────────────────────────────────────────────────────────

export function signalsDir(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug, "signals");
}

export function signalsFilePath(dataDir: string, slug: string, date: string): string {
  return path.join(signalsDir(dataDir, slug), `${date}.json`);
}

export function readSignals(dataDir: string, slug: string, date: string): ExternalSignal[] {
  const p = signalsFilePath(dataDir, slug, date);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8") as string) as ExternalSignal[];
  } catch {
    return [];
  }
}

export function writeSignals(
  dataDir: string,
  slug: string,
  date: string,
  signals: ExternalSignal[]
): void {
  writeJsonFile(signalsFilePath(dataDir, slug, date), signals);
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

export async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "GET",
      headers: { "User-Agent": "datasynx-opencrm/2.0", ...headers },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

// ─── Hacker News / Algolia API (free, no key needed) ─────────────────────────

interface HNHit {
  objectID: string;
  title?: string;
  story_title?: string;
  url?: string;
  created_at: string;
}

interface HNSearchResult {
  hits: HNHit[];
}

export async function checkCompanyNews(
  domain: string,
  companyName: string
): Promise<ExternalSignal[]> {
  const signals: ExternalSignal[] = [];
  try {
    const query = encodeURIComponent(companyName.split(" ")[0] ?? domain.split(".")[0] ?? "");
    const since = Math.floor(Date.now() / 1000) - 30 * 86400;
    const url = `https://hn.algolia.com/api/v1/search?query=${query}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=5`;
    const result = await fetchJson<HNSearchResult>(url);

    for (const hit of result.hits ?? []) {
      const title = hit.title ?? hit.story_title ?? "";
      if (!title.toLowerCase().includes(query.toLowerCase())) continue;

      const titleLc = title.toLowerCase();
      const type: SignalType = titleLc.includes("fund")
        ? "funding_round"
        : titleLc.includes("acqui")
          ? "acquisition"
          : titleLc.includes("lay") || titleLc.includes("reduc")
            ? "layoffs"
            : "news_mention";

      const impact: SignalImpact =
        type === "funding_round" || type === "acquisition"
          ? "positive"
          : type === "layoffs"
            ? "negative"
            : "neutral";

      signals.push({
        id: `hn_${hit.objectID}`,
        slug: "",
        source: "hacker_news",
        type,
        summary: title,
        url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
        detectedAt: new Date().toISOString(),
        impact,
      });
    }
  } catch {
    // Network errors are non-fatal
  }
  return signals;
}

// ─── Crunchbase Basic API (CRUNCHBASE_API_KEY optional) ──────────────────────

interface CrunchbaseOrg {
  properties?: {
    short_description?: string;
    funding_total?: { value_usd?: number };
    last_funding_type?: string;
  };
}

export async function checkFundingEvents(domain: string): Promise<ExternalSignal[]> {
  const apiKey = process.env["CRUNCHBASE_API_KEY"];
  if (!apiKey) return [];

  const signals: ExternalSignal[] = [];
  try {
    const orgName = domain.split(".")[0] ?? domain;
    const url = `https://api.crunchbase.com/api/v4/entities/organizations/${orgName}?field_ids=short_description,funding_total,last_funding_type&user_key=${apiKey}`;
    const result = await fetchJson<{ data?: CrunchbaseOrg }>(url);
    const props = result.data?.properties;

    if (props?.last_funding_type && props?.funding_total?.value_usd) {
      const millions = (props.funding_total.value_usd / 1_000_000).toFixed(1);
      signals.push({
        id: `cb_${domain}_${Date.now()}`,
        slug: "",
        source: "crunchbase",
        type: "funding_round",
        summary: `${domain} raised funding (${props.last_funding_type}, $${millions}M total)`,
        detectedAt: new Date().toISOString(),
        impact: "positive",
      });
    }
  } catch {
    // Non-fatal
  }
  return signals;
}

// ─── Clearbit enrichment (CLEARBIT_API_KEY optional) ─────────────────────────

interface ClearbitPerson {
  name?: { fullName?: string };
  employment?: { title?: string; name?: string };
}

export async function enrichContact(
  email: string
): Promise<{ name?: string; title?: string; company?: string } | null> {
  const apiKey = process.env["CLEARBIT_API_KEY"];
  if (!apiKey) return null;

  try {
    const url = `https://person.clearbit.com/v2/combined/find?email=${encodeURIComponent(email)}`;
    const result = await fetchJson<ClearbitPerson>(url, {
      Authorization: `Bearer ${apiKey}`,
    });
    return {
      ...(result.name?.fullName ? { name: result.name.fullName } : {}),
      ...(result.employment?.title ? { title: result.employment.title } : {}),
      ...(result.employment?.name ? { company: result.employment.name } : {}),
    };
  } catch {
    return null;
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function fetchSignalsForCustomer(
  dataDir: string,
  slug: string,
  domain: string,
  companyName: string,
  today: string
): Promise<ExternalSignal[]> {
  const [newsSignals, fundingSignals] = await Promise.all([
    checkCompanyNews(domain, companyName),
    checkFundingEvents(domain),
  ]);

  const signals: ExternalSignal[] = [
    ...newsSignals.map((s) => ({ ...s, slug })),
    ...fundingSignals.map((s) => ({ ...s, slug })),
  ];

  if (signals.length > 0) {
    writeSignals(dataDir, slug, today, signals);
  }

  return signals;
}
