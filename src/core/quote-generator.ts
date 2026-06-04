import fs from "fs";
import path from "path";
import { writeFileAtomic } from "../fs/atomic-write.js";
import yaml from "js-yaml";
import type { Quote, QuoteLineItem } from "../schemas/quote.js";

interface QuoteConfig {
  companyName?: string;
  companyAddress?: string;
  vatId?: string;
  currency?: string;
  paymentTerms?: string;
  footerText?: string;
}

export interface GenerateQuoteInput {
  slug: string;
  dealName: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number }>;
  vatPercent?: number;
  validUntilDays?: number;
  currency?: string;
}

function quotesDir(dataDir: string): string {
  return path.join(dataDir, ".agentic", "quotes");
}

function loadQuoteConfig(dataDir: string): QuoteConfig {
  const p = path.join(dataDir, ".agentic", "quote-config.yaml");
  if (!fs.existsSync(p)) return {};
  try {
    return (yaml.load(fs.readFileSync(p, "utf-8") as string) as QuoteConfig) ?? {};
  } catch {
    return {};
  }
}

function nextQuoteNumber(dataDir: string): string {
  const year = new Date().getFullYear();
  const dir = quotesDir(dataDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return `Q-${year}-001`;
  }
  const existing = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f.startsWith(`Q-${year}-`))
    .map((f) => parseInt(f.replace(`Q-${year}-`, "").replace(".json", ""), 10))
    .filter((n) => !isNaN(n));
  const max = existing.length > 0 ? Math.max(...existing) : 0;
  return `Q-${year}-${String(max + 1).padStart(3, "0")}`;
}

function addDaysToDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildHtml(quote: Quote, config: QuoteConfig, customerName: string): string {
  const lineRows = quote.lineItems
    .map(
      (item) =>
        `<tr><td>${item.description}</td><td style="text-align:right">${item.quantity}</td><td style="text-align:right">${item.unitPrice.toFixed(2)} ${quote.currency}</td><td style="text-align:right">${item.total.toFixed(2)} ${quote.currency}</td></tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><title>Angebot ${quote.quoteNumber}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222}table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #ddd}th{background:#f5f5f5}h1{color:#1a1a2e}.total{font-weight:bold;font-size:1.1em}</style>
</head>
<body>
<h1>Angebot ${quote.quoteNumber}</h1>
<p><strong>${config.companyName ?? ""}</strong><br>${config.companyAddress ?? ""}<br>${config.vatId ? `USt-IdNr.: ${config.vatId}` : ""}</p>
<hr>
<p><strong>An:</strong> ${customerName}</p>
<p><strong>Datum:</strong> ${quote.createdAt.slice(0, 10)} &nbsp;&nbsp; <strong>Gültig bis:</strong> ${quote.validUntil}</p>
<h2>Leistungen</h2>
<table>
<thead><tr><th>Beschreibung</th><th style="text-align:right">Menge</th><th style="text-align:right">Einzelpreis</th><th style="text-align:right">Gesamt</th></tr></thead>
<tbody>${lineRows}</tbody>
</table>
<br>
<table style="width:300px;margin-left:auto">
<tr><td>Nettobetrag</td><td style="text-align:right">${quote.subtotal.toFixed(2)} ${quote.currency}</td></tr>
<tr><td>MwSt. (${quote.vatPercent}%)</td><td style="text-align:right">${quote.vat.toFixed(2)} ${quote.currency}</td></tr>
<tr class="total"><td><strong>Gesamtbetrag</strong></td><td style="text-align:right"><strong>${quote.total.toFixed(2)} ${quote.currency}</strong></td></tr>
</table>
<br><p>${config.paymentTerms ?? ""}</p>
<hr><small>${config.footerText ?? ""}</small>
</body></html>`;
}

function readCustomerName(dataDir: string, slug: string): string {
  const p = path.join(dataDir, "customers", slug, "main_facts.md");
  if (!fs.existsSync(p)) return slug;
  const content = fs.readFileSync(p, "utf-8") as string;
  const match = /^name:\s*(.+)$/m.exec(content);
  return match?.[1]?.trim() ?? slug;
}

export function readQuote(dataDir: string, quoteNumber: string): Quote | null {
  const p = path.join(quotesDir(dataDir), `${quoteNumber}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8") as string) as Quote;
  } catch {
    return null;
  }
}

export function listQuotes(dataDir: string, slug?: string): Quote[] {
  const dir = quotesDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      try {
        const q = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8") as string) as Quote;
        return slug === undefined || q.slug === slug ? [q] : [];
      } catch {
        return [];
      }
    });
}

export function updateQuoteStatus(
  dataDir: string,
  quoteNumber: string,
  status: Quote["status"]
): void {
  const q = readQuote(dataDir, quoteNumber);
  if (!q) return;
  const updated: Quote = { ...q, status };
  if (status === "viewed" && !q.viewedAt) updated.viewedAt = new Date().toISOString();
  if (status === "accepted" && !q.acceptedAt) updated.acceptedAt = new Date().toISOString();
  writeFileAtomic(
    path.join(quotesDir(dataDir), `${quoteNumber}.json`),
    JSON.stringify(updated, null, 2)
  );
}

export async function generateQuote(dataDir: string, input: GenerateQuoteInput): Promise<Quote> {
  const config = loadQuoteConfig(dataDir);
  const vatPercent = input.vatPercent ?? 19;
  const validUntilDays = input.validUntilDays ?? 30;
  const currency = input.currency ?? config.currency ?? "EUR";

  const items: QuoteLineItem[] = input.lineItems.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.quantity * item.unitPrice,
  }));

  const subtotal = items.reduce((sum, i) => sum + i.total, 0);
  const vat = Math.round(subtotal * (vatPercent / 100) * 100) / 100;
  const total = Math.round((subtotal + vat) * 100) / 100;

  const quoteNumber = nextQuoteNumber(dataDir);
  const now = new Date().toISOString();
  const validUntil = addDaysToDate(now.slice(0, 10), validUntilDays);

  const dir = quotesDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });

  const htmlPath = path.join(dir, `${quoteNumber}.html`);

  const quote: Quote = {
    quoteNumber,
    slug: input.slug,
    dealName: input.dealName,
    lineItems: items,
    subtotal,
    vatPercent,
    vat,
    total,
    currency,
    createdAt: now,
    validUntilDays,
    validUntil,
    status: "draft",
    htmlPath,
  };

  writeFileAtomic(path.join(dir, `${quoteNumber}.json`), JSON.stringify(quote, null, 2));

  const customerName = readCustomerName(dataDir, input.slug);
  const html = buildHtml(quote, config, customerName);
  writeFileAtomic(htmlPath, html);

  return quote;
}
