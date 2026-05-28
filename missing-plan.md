# DatasynxOpenCRM — Missing Plan
> Tiefe Gap-Analyse gegen `plan-next-dxc.md` (D11–D20)
> Stand: 2026-05-28 · Basis: 1615 Tests grün · 30 MCP-Tools registriert

---

## Executive Summary

Acht der zehn Dominos (D11–D20) sind technisch vollständig implementiert.
Zwei Dominos haben strukturelle Lücken die verhindern, dass das System **autonom** und **proaktiv** handelt:

- **D18 ohne externe Signale** = `get_org_intelligence` gibt Stubs zurück statt echter Alpha-Daten
- **D20 ohne Daemon-Verdrahtung** = Proactive Agent läuft nie; Queue wird nie geleert; Notifications werden nie gesendet

Dazu kommen vier architektonische Lücken und zwei Test-/Dokumentations-Defizite.

**Gesamtaufwand: 5–7 Entwicklertage** aufgeteilt auf 8 präzise Tasks.

---

## Gap-Übersicht nach Priorität

| # | Gap | Domino | Impact | Aufwand |
|---|---|---|---|---|
| G1 | Harness-Content v1 → v2 | Sprint P5 | **KRITISCH** — Agents nutzen 0 v2-Tools | 0,5 Tage |
| G2 | Proactive Daemon nicht verdrahtet | D20 | **KRITISCH** — Proaktivität existiert nur als Library | 1 Tag |
| G3 | Queue-Draining + Notification Dispatch | D20 | **KRITISCH** — Tasks verschwinden in der Queue | 1 Tag |
| G4 | External Signals Modul fehlt | D18 | **HOCH** — org_intelligence gibt Stubs zurück | 1,5 Tage |
| G5 | GDPR `.agentic/`-Ebene unvollständig | D17/D20 | **HOCH** — Compliance-Lücke | 0,5 Tage |
| G6 | `findPath` fehlt / warmIntroPath leer | D11 | **MITTEL** — Alpha-Feature der Graph-Vision fehlt | 0,5 Tage |
| G7 | E2E-Tests für D19/D20 fehlen | Sprint P5 | **MITTEL** — kritischer Pfad nicht abgedeckt | 1 Tag |
| G8 | Goal-Fortschritt nie auto-synchronisiert | D16 | **NIEDRIG** — manueller Progress ein Workaround | 0,5 Tage |

---

## G1 — Harness-Content v1 → v2

### Problem

`src/setup/harness-content.ts` wurde seit Phase 1 nicht aktualisiert. Alle sechs Harness-Dateien
(CLAUDE.md, AGENTS.md, SOUL.md, Cursor-Rules, Grok-Settings, Antigravity-GEMINI.md) listen noch die
**8 v1-Tools** und das v1-Workflow-Pattern.

```typescript
// harness-content.ts Zeile 9 — HEUTE:
"You have access to 8 MCP tools."

// SOLL (v2):
"You have access to 30 MCP tools."
```

Das bedeutet: Jeder Agent, der `dxcrm init` ausgeführt hat oder neu ausführt, bekommt
Instruktionen die `open_deal_room`, `get_proactive_briefing`, `pursue_goal`, `run_deal_agent`,
`get_relationship_health` etc. **vollständig verschweigen**. Die v2-Dominos sind für den Agent
unsichtbar, solange die Harness-Files nicht aktualisiert sind.

### Implementierung

**Datei:** `src/setup/harness-content.ts`

Alle sechs Funktionen müssen aktualisiert werden:

```typescript
// buildClaudeMd(dataDir) — vollständige v2-Version:
export function buildClaudeMd(dataDir: string): string {
  return `# DatasynxOpenCRM v2 — Agent Instructions (30 Tools)

## Proaktive Nutzung — Immer zuerst
Warte nicht bis der User fragt. Bei Session-Start:
1. \`get_proactive_briefing()\` — Top-Prioritäten des Tages
2. \`get_goal_status()\` — falls aktive Goals existieren

## Vor jedem Deal-Gespräch
\`open_deal_room({ slug, dealName })\` statt \`get_customer_context()\`
→ enthält bereits Graph, Health, Simulation, Playbook, External Signals in einem Call

## Standard-Workflow
1. Kunde erwähnt → \`get_customer_context(slug)\` oder \`open_deal_room()\`
2. Nach Interaktion → \`log_interaction()\`
3. Deal-Diskussion → \`update_deal()\`
4. Historische Frage → \`search_customer_knowledge()\`

## Autonomie-Pattern
User: "Schau dir Acme Corp an"
→ open_deal_room({ slug: "acme-corp", dealName: "aktiver Deal" })
→ Fasse in 3 Bullets zusammen, empfehle 1 Aktion

User: "Was muss ich heute tun?"
→ get_proactive_briefing()
→ get_goal_status() (falls Goals aktiv)
→ Antworte mit priorisierten Aktionen

## Alle 30 MCP-Tools

### Kern (v1)
- \`get_capabilities()\` — Tool-Referenz
- \`get_customer_context(slug?)\` — Vollbriefing + Gmail-Sync
- \`search_customer_knowledge(slug, query)\` — Vektor-Suche
- \`list_customers(filter?)\` — Übersicht mit Health
- \`log_interaction(slug, type, summary)\` — Schreiben nach Interaktion
- \`update_deal(slug, dealName, fields)\` — Pipeline-Update
- \`export_customer(slug)\` — ZIP-Export
- \`update_customer_facts(slug, fields)\` — Stammdaten ändern
- \`get_active_session()\` — Aktive Session prüfen
- \`get_deal_health(slug)\` — Deal-Health-Score
- \`get_pipeline_forecast()\` — Gewichteter Forecast
- \`summarize_meeting(transcript)\` — Meeting-Transcript analysieren
- \`get_pipeline_stages()\` — Konfigurierte Stages
- \`get_market_intelligence(slug)\` — Markt-/Wettbewerbs-Kontext

### Graph & Health (D11/D12)
- \`get_relationship_graph(slug)\` — Stakeholder-Graph, warmIntroPath
- \`get_relationship_health(slug)\` — Decay-Detection, Risk-Flags

### Autonomous Agent (D13)
- \`run_deal_agent(slug, dealName, autonomyLevel)\` — Deal-Analyse + autonome Aktionen
- \`approve_agent_action(actionId, approved)\` — Queued Action freigeben

### Revenue Intelligence (D14/D18)
- \`simulate_revenue(horizon)\` — Monte Carlo P10/P50/P90
- \`get_org_intelligence(slug, dealName)\` — Stakeholder-Map + externe Signale

### Playbooks (D15)
- \`get_playbook(slug, situation)\` — Passendes Playbook für Situation
- \`create_playbook(name, trigger, content)\` — Neues Playbook
- \`list_playbooks()\` — Alle Playbooks
- \`distill_playbook(slug, dealName, outcome)\` — Aus Deal lernen

### Goals (D16)
- \`pursue_goal(goal, deadline)\` — Ziel dekompomieren + tracken
- \`get_goal_status()\` — Fortschritt aktiver Goals

### Push (D17)
- \`register_push_subscription(provider, webhookUrl)\` — Push registrieren
- \`get_push_status()\` — Aktive Subscriptions

### Proactive (D20)
- \`open_deal_room(slug, dealName)\` — Vollständiger Deal-Brief (7 sub-tools)
- \`get_proactive_briefing(date?)\` — Tages-Zusammenfassung

## Datenverzeichnis
${dataDir}`.trim();
}
```

Analog müssen `buildAgentsMd`, `buildSoulMd`, `buildCursorRulesMdc`, `buildAgyGeminiMd`
aktualisiert werden — alle mit v2-Tool-Liste und proaktiven Nutzungsmustern.

### Tests

- `__tests__/setup/harness-content.test.ts` — neue Tests: prüfen ob alle 30 Tool-Namen in
  mindestens einer Harness-Funktion erwähnt werden; prüfen ob `get_proactive_briefing` in
  buildClaudeMd vorkommt; prüfen ob "30 MCP Tools" in buildClaudeMd erwähnt.

---

## G2 — Proactive Daemon nicht verdrahtet

### Problem

`src/core/proactive-agent.ts` hat `buildDailyBriefing()` und `enqueueTask()` — aber
`src/daemon/worker.ts` ruft keines davon auf. Der gesamte D20-Stack läuft nur on-demand via
`get_proactive_briefing` MCP-Tool, nicht proaktiv.

Das Plan-Soll:
```
Proactive Agent läuft im Hintergrund (via Daemon), checkt alle Kunden täglich
und sendet proaktive Alerts.
Der User soll morgens aufwachen und eine Zusammenfassung haben, die er nicht
angefordert hat.
```

Das System tut das aktuell nicht. Die CronJobs im Daemon sind:
1. Gmail-Sync alle 30 Min ✅
2. Backup-Check stündlich ✅
3. Push-Subscription-Renewal täglich 06:00 ✅
4. **Proactive-Daily-Check — FEHLT**

### Implementierung

**Datei:** `src/daemon/worker.ts` — neuer CronJob hinzufügen:

```typescript
// Daily proactive check — 07:00 Lokalzeit
new CronJob(
  "0 7 * * *",
  async () => {
    try {
      const { buildDailyBriefing, enqueueTask } = await import("../core/proactive-agent.js");
      const { computeCustomerHealth } = await import("../core/relationship-health.js");
      const { readPipeline } = await import("../fs/pipeline-writer.js");

      const today = new Date().toISOString().slice(0, 10);
      const customersDir = path.join(DATA_DIR, "customers");
      if (!fs.existsSync(customersDir)) return;

      const slugs = fs.readdirSync(customersDir).filter((s) => {
        try { return fs.statSync(path.join(customersDir, s)).isDirectory(); } catch { return false; }
      });

      // 1. Per-customer health checks → enqueue alerts
      for (const slug of slugs) {
        try {
          const health = computeCustomerHealth(DATA_DIR, slug, today);

          for (const contact of health.contacts) {
            if (contact.riskFlags.includes("NO_CONTACT_30D") || contact.grade === "F") {
              await enqueueTask(DATA_DIR, {
                type: "relationship_decay_alert",
                slug,
                priority: "high",
                payload: { contactId: contact.contactId, name: contact.name, daysSinceContact: contact.daysSinceContact, grade: contact.grade },
                scheduledFor: new Date().toISOString(),
                channel: process.env["TELEGRAM_BOT_TOKEN"] ? "telegram" : "mcp_tool_response",
              });
            }
          }

          // Deal risk alerts
          const deals = await readPipeline(DATA_DIR, slug).catch(() => []);
          const todayMs = new Date().getTime();
          for (const deal of deals) {
            if (deal.stage === "won" || deal.stage === "lost") continue;
            if (deal.close_date) {
              const daysToClose = Math.floor((new Date(deal.close_date).getTime() - todayMs) / 86_400_000);
              if (daysToClose <= 7 && daysToClose >= 0) {
                await enqueueTask(DATA_DIR, {
                  type: "deal_risk_alert",
                  slug,
                  priority: "urgent",
                  payload: { dealName: deal.name, daysToClose, stage: deal.stage },
                  scheduledFor: new Date().toISOString(),
                  channel: process.env["TELEGRAM_BOT_TOKEN"] ? "telegram" : "mcp_tool_response",
                });
              }
            }
          }
        } catch (err) {
          process.stderr.write(`[proactive] ${slug}: ${(err as Error).message}\n`);
        }
      }

      // 2. Daily briefing task
      const briefing = await buildDailyBriefing(DATA_DIR, today);
      await enqueueTask(DATA_DIR, {
        type: "daily_briefing",
        priority: "normal",
        payload: briefing,
        scheduledFor: new Date().toISOString(),
        channel: process.env["TELEGRAM_BOT_TOKEN"] ? "telegram" : "mcp_tool_response",
      });

      // 3. Drain queue — send pending tasks
      await drainProactiveQueue(DATA_DIR);

      process.stderr.write(`[proactive] Daily check complete — ${today}\n`);
    } catch (err) {
      process.stderr.write(`[proactive] Daily check failed: ${(err as Error).message}\n`);
    }
  },
  null,
  true,
  undefined,
  null,
  false, // runOnInit: false — nur täglich um 07:00
  undefined,
  true  // waitForCompletion
);
```

### Tests

- `__tests__/daemon/proactive-cron.test.ts` — mock CronJob, verify proactive check fires;
  mock `buildDailyBriefing` + `enqueueTask`; verify they're called.

---

## G3 — Queue-Draining + Notification Dispatch

### Problem

Der Kern des Problems: Die Queue (`enqueueTask` → `.agentic/agent-queue.json`) wird gefüllt aber
**nie geleert**. Es gibt keine `drainProactiveQueue()` Funktion. Tasks akkumulieren ohne
dass jemals eine Telegram- oder Slack-Nachricht gesendet wird.

Das ist das zweite Bein von D20. Ohne Dispatch ist der Proactive Agent konzeptuell korrekt
aber praktisch nutzlos.

### Implementierung

**Neue Datei:** `src/core/notification-dispatcher.ts`

```typescript
// src/core/notification-dispatcher.ts
import https from "https";
import { readQueue, markTaskDone, type AgentTask } from "./proactive-agent.js";

export async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" });
  await new Promise<void>((resolve, reject) => {
    const req = https.request(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      (res) => { res.resume(); resolve(); }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function sendSlack(webhookUrl: string, text: string): Promise<void> {
  const body = JSON.stringify({ text });
  const url = new URL(webhookUrl);
  await new Promise<void>((resolve, reject) => {
    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      (res) => { res.resume(); resolve(); }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function formatTaskMessage(task: AgentTask): string {
  const payload = task.payload as Record<string, unknown>;
  switch (task.type) {
    case "daily_briefing": {
      const b = payload as { urgent?: string[]; forecast?: string; topAction?: string };
      const lines = ["📋 *Daily CRM Briefing*", ""];
      if (b.urgent?.length) { lines.push("🚨 *Urgent:*"); b.urgent.slice(0, 3).forEach(u => lines.push(`• ${u}`)); lines.push(""); }
      if (b.forecast) lines.push(`📊 ${b.forecast}`);
      if (b.topAction) lines.push(`\n⚡ *Top Action:* ${b.topAction}`);
      return lines.join("\n");
    }
    case "relationship_decay_alert":
      return `⚠️ *Relationship Alert: ${String(payload["slug"] ?? "")}*\n${String(payload["name"] ?? "")} — ${String(payload["daysSinceContact"] ?? "?")} days silent, grade ${String(payload["grade"] ?? "?")}`;
    case "deal_risk_alert":
      return `🔴 *Deal Risk: ${String(payload["slug"] ?? "")}*\n"${String(payload["dealName"] ?? "")}" closes in ${String(payload["daysToClose"] ?? "?")} days`;
    case "external_signal_alert":
      return `💡 *Signal: ${String(payload["slug"] ?? "")}*\n${String(payload["summary"] ?? "")}`;
    case "follow_up_nudge":
      return `📞 *Follow-up: ${String(payload["slug"] ?? "")}*\n${String(payload["message"] ?? "")}`;
    default:
      return `📌 CRM Task (${task.type})\n${JSON.stringify(payload).slice(0, 200)}`;
  }
}

export async function drainProactiveQueue(dataDir: string): Promise<{ sent: number; failed: number }> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = process.env["TELEGRAM_CHAT_ID"];
  const slackUrl = process.env["SLACK_WEBHOOK_URL"];

  const tasks = readQueue(dataDir).filter(t => t.status === "pending");
  let sent = 0;
  let failed = 0;

  for (const task of tasks) {
    const message = formatTaskMessage(task);
    try {
      if (task.channel === "telegram" && token && chatId) {
        await sendTelegram(token, chatId, message);
      } else if (task.channel === "slack" && slackUrl) {
        await sendSlack(slackUrl, message);
      }
      // mcp_tool_response tasks are consumed by get_proactive_briefing — mark done
      await markTaskDone(dataDir, task.id, "dispatched");
      sent++;
    } catch (err) {
      failed++;
      process.stderr.write(`[dispatch] Task ${task.id} failed: ${(err as Error).message}\n`);
    }
  }

  return { sent, failed };
}
```

**Anpassung `worker.ts`:** `drainProactiveQueue` am Ende des Proactive-CronJobs aufrufen
(bereits im G2-Code oben als `await drainProactiveQueue(DATA_DIR)` eingebaut).

### Tests

- `__tests__/core/notification-dispatcher.test.ts`:
  - `sendTelegram` — mock https.request, verify POST payload
  - `formatTaskMessage` — je TaskType expected string prüfen
  - `drainProactiveQueue` — mock `readQueue` mit pending tasks, verify `markTaskDone` called,
    verify send functions called für telegram/slack channels
  - Tasks mit `channel: "mcp_tool_response"` werden silent als done markiert

---

## G4 — External Signals Modul (`src/sync/external-signals.ts`)

### Problem

`get_org_intelligence` gibt für externe Signale `_signals: unknown[]` zurück — ein Stub.
Der Plan sah drei Signal-Quellen vor:

1. **Hacker News / Algolia API** — kein API-Key, kostenlos
2. **Crunchbase Basic API** — kostenlos-Tier, Funding Events
3. **Clearbit Enrichment** — optional, nur wenn `CLEARBIT_API_KEY` gesetzt

Ohne externe Signale fehlt dem Proactive Agent die wichtigste Datenbasis für
`external_signal_alert` Tasks (Funding-Runden, CEO-Wechsel, Layoffs).

### Implementierung

**Neue Datei:** `src/sync/external-signals.ts`

```typescript
// src/sync/external-signals.ts
import https from "https";
import fs from "fs";
import path from "path";

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

// ─── File path ────────────────────────────────────────────────────────────────

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
  } catch { return []; }
}

export function writeSignals(dataDir: string, slug: string, date: string, signals: ExternalSignal[]): void {
  const dir = signalsDir(dataDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(signalsFilePath(dataDir, slug, date), JSON.stringify(signals, null, 2), "utf-8");
}

// ─── HTTP helper (no external deps) ──────────────────────────────────────────

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
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
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        try { resolve(JSON.parse(data) as T); }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

// ─── Hacker News / Algolia API (free, no key needed) ──────────────────────────

interface HNHit {
  objectID: string;
  title?: string;
  story_title?: string;
  url?: string;
  created_at: string;
}

interface HNSearchResult { hits: HNHit[] }

export async function checkCompanyNews(domain: string, companyName: string): Promise<ExternalSignal[]> {
  const signals: ExternalSignal[] = [];
  try {
    // Extract company name from domain (acme.com → acme)
    const query = encodeURIComponent(companyName.split(" ")[0] ?? domain.split(".")[0] ?? "");
    const url = `https://hn.algolia.com/api/v1/search?query=${query}&tags=story&numericFilters=created_at_i>${Math.floor(Date.now() / 1000) - 30 * 86400}&hitsPerPage=5`;
    const result = await fetchJson<HNSearchResult>(url);

    for (const hit of result.hits ?? []) {
      const title = hit.title ?? hit.story_title ?? "";
      if (!title.toLowerCase().includes(query.toLowerCase())) continue;

      const type: SignalType = title.toLowerCase().includes("fund") ? "funding_round"
        : title.toLowerCase().includes("acqui") ? "acquisition"
        : title.toLowerCase().includes("lay") || title.toLowerCase().includes("reduc") ? "layoffs"
        : "news_mention";

      const impact: SignalImpact = type === "funding_round" || type === "acquisition" ? "positive"
        : type === "layoffs" ? "negative"
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

// ─── Crunchbase Basic API (free tier, CRUNCHBASE_API_KEY optional) ─────────────

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
      signals.push({
        id: `cb_${domain}_${Date.now()}`,
        slug: "",
        source: "crunchbase",
        type: "funding_round",
        summary: `${domain} raised funding (${props.last_funding_type}, $${(props.funding_total.value_usd / 1_000_000).toFixed(1)}M total)`,
        detectedAt: new Date().toISOString(),
        impact: "positive",
      });
    }
  } catch {
    // Non-fatal
  }
  return signals;
}

// ─── Clearbit enrichment (optional, CLEARBIT_API_KEY) ─────────────────────────

interface ClearbitPerson {
  name?: { fullName?: string };
  employment?: { title?: string; name?: string };
}

export async function enrichContact(email: string): Promise<{ name?: string; title?: string; company?: string } | null> {
  const apiKey = process.env["CLEARBIT_API_KEY"];
  if (!apiKey) return null;

  try {
    const url = `https://person.clearbit.com/v2/combined/find?email=${encodeURIComponent(email)}`;
    const result = await fetchJson<ClearbitPerson>(url, { Authorization: `Bearer ${apiKey}` });
    return {
      name: result.name?.fullName,
      title: result.employment?.title,
      company: result.employment?.name,
    };
  } catch {
    return null;
  }
}

// ─── Main entry point: fetch all signals for a customer ──────────────────────

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
```

**Integration in `src/core/org-intelligence.ts`:**

Die `_signals: unknown[]` Stub-Zeile durch echten Aufruf ersetzen:
```typescript
// Vorher:
const _signals: unknown[] = [];

// Nachher (in buildStakeholderMap oder eigener async-Funktion):
import { fetchSignalsForCustomer } from "../sync/external-signals.js";

const signals = await fetchSignalsForCustomer(dataDir, slug, domain, name, today);
// → in den Return-Wert einbauen
```

**Integration in `src/daemon/worker.ts` (G2-CronJob):**
```typescript
const { fetchSignalsForCustomer } = await import("../sync/external-signals.js");
const signals = await fetchSignalsForCustomer(DATA_DIR, slug, domain, companyName, today);

for (const signal of signals.filter(s => s.impact !== "neutral")) {
  await enqueueTask(DATA_DIR, {
    type: "external_signal_alert",
    slug,
    priority: signal.impact === "positive" ? "high" : "urgent",
    payload: signal,
    scheduledFor: new Date().toISOString(),
    channel: process.env["TELEGRAM_BOT_TOKEN"] ? "telegram" : "mcp_tool_response",
  });
}
```

### Tests

- `__tests__/sync/external-signals.test.ts`:
  - `checkCompanyNews` — mock https.request mit HN-Antwort; verify ExternalSignal zurückgegeben
  - `checkFundingEvents` — ohne `CRUNCHBASE_API_KEY` → leeres Array; mit key → mock API
  - `enrichContact` — ohne `CLEARBIT_API_KEY` → null; mit key → mock API
  - `fetchSignalsForCustomer` — writes `signals/YYYY-MM-DD.json`
  - Network-Fehler sind nicht-fatal (keine Exception)
  - Timeout nach 5s

---

## G5 — GDPR `.agentic/`-Ebene unvollständig

### Problem

`gdpr.ts` löscht `fs.rmSync(customerDir, { recursive: true })` — das löscht korrekt:
`graph.json`, `health.json`, `playbooks/`, `agent-queue.json` (deal-agent), `signals/` ✅

**Aber nicht gelöscht:**
- `.agentic/agent-queue.json` — Tasks mit diesem slug bleiben in der globalen Queue
- `.agentic/goals.json` — Goals die diesen Kunden referenzieren bleiben erhalten
- `.agentic/push-subscriptions.json` — Subscriptions für diesen slug bleiben aktiv

Das ist eine echte DSGVO-Lücke: nach `dxcrm gdpr erase` könnte der Agent morgens noch eine
Proactive-Notification über den gelöschten Kunden senden.

### Implementierung

**Datei:** `src/commands/gdpr.ts` — in `runGdprErase` nach dem `rmSync`:

```typescript
// Nach fs.rmSync(customerDir, ...):

// Clean up .agentic/-level references to this slug
import { withJsonFile } from "../core/file-lock.js";

// 1. Remove tasks from global agent queue
const globalQueuePath = path.join(dir, ".agentic", "agent-queue.json");
if (fs.existsSync(globalQueuePath)) {
  await withJsonFile<unknown[]>(globalQueuePath, (tasks) =>
    (Array.isArray(tasks) ? tasks : []).filter(
      (t) => (t as { slug?: string }).slug !== slug
    )
  );
}

// 2. Remove goals referencing this slug (sub-goals)
const goalsPath = path.join(dir, ".agentic", "goals.json");
if (fs.existsSync(goalsPath)) {
  const { writeGoals, readGoals } = await import("../core/goal-engine.js");
  const goals = readGoals(dir);
  const cleaned = goals.map((g) => ({
    ...g,
    decomposition: {
      ...g.decomposition,
      subGoals: g.decomposition.subGoals.filter((sg) => sg.slug !== slug),
    },
  }));
  writeGoals(dir, cleaned);
}

// 3. Revoke push subscriptions for this slug
const { readSubscriptions, writeSubscriptions } = await import("../sync/push-manager.js");
const subs = await readSubscriptions(dir);
const remaining = subs.filter((s) => s.slug !== slug);
if (remaining.length !== subs.length) {
  await writeSubscriptions(dir, remaining);
}
```

### Tests

- `__tests__/commands/gdpr.test.ts` — neue Test-Cases:
  - Nach `runGdprErase`: verify agent-queue tasks mit slug sind weg
  - Nach `runGdprErase`: verify push-subscriptions für slug sind weg
  - Nach `runGdprErase`: verify goal sub-goals für slug sind weg

---

## G6 — `findPath` / warmIntroPath fehlt

### Problem

`get_relationship_graph` gibt zurück:
```json
{ "stakeholders": { "champions": [], "blockers": [], "economicBuyers": [] }, "nodes": [], "edges": [] }
```

**Fehlt:** `warmIntroPath` — der Warm-Introduction-Pfad aus dem Plan:
```json
{ "warmIntroPath": ["our.contact@partner.com", "sarah.schmidt@acme.com"] }
```

Das ist die Killer-Feature der Graph-Vision: "Wer kennt wen, damit ich Sarah warm vorgestellt
werden kann?" — aktuell nicht implementiert.

### Implementierung

**Datei:** `src/core/graph.ts` — neue Funktion:

```typescript
// BFS shortest path between two nodes
export function findPath(graph: CustomerGraph, fromId: string, toId: string): string[] {
  if (fromId === toId) return [fromId];

  const visited = new Set<string>([fromId]);
  const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: fromId, path: [fromId] }];

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Find all connected nodes via any edge
    const neighbors = graph.edges
      .filter((e) => e.from === current.nodeId || e.to === current.nodeId)
      .map((e) => (e.from === current.nodeId ? e.to : e.from))
      .filter((id) => !visited.has(id));

    for (const neighborId of neighbors) {
      const newPath = [...current.path, neighborId];
      if (neighborId === toId) return newPath;
      visited.add(neighborId);
      queue.push({ nodeId: neighborId, path: newPath });
    }
  }

  return []; // No path found
}
```

**Datei:** `src/mcp/tools/get-relationship-graph.ts` — warmIntroPath hinzufügen:

```typescript
// In handleGetRelationshipGraph, nach getStakeholders():
const myContacts = graph.nodes
  .filter(n => n.type === "person" && n.properties["isOwnerContact"] === true)
  .map(n => n.id);

const economicBuyerIds = stakeholders.economicBuyers.map(n => n.id);

// Find warm intro path to each economic buyer we haven't contacted directly
const warmIntroPaths: Array<{ target: string; path: string[] }> = [];
for (const ebId of economicBuyerIds) {
  for (const myContactId of myContacts) {
    const path = findPath(graph, myContactId, ebId);
    if (path.length > 1) {
      warmIntroPaths.push({ target: ebId, path });
      break;
    }
  }
}

// In JSON return:
warmIntroPaths,
```

### Tests

- `__tests__/core/graph.test.ts` — neue Tests für `findPath`:
  - Direkte Verbindung → path mit 2 Nodes
  - Indirekte Verbindung (A→B→C) → path mit 3 Nodes
  - Kein Pfad → leeres Array
  - Kreisschluss → kein Endlos-Loop (visited-Set)

---

## G7 — E2E Tests für D19 und D20

### Problem

`plan-next-dxc.md` Sprint P5 sieht explizit vor:
- `proactive-workflow.test.ts`
- `deal-room-workflow.test.ts`

Diese fehlen vollständig. Damit ist der kritische Pfad für die zwei komplexesten Dominos
(D19 Multi-Agent Deal Room, D20 Proactive Agent) nicht durch automatisierte Tests abgesichert.

### Implementierung

**Datei:** `__tests__/e2e/proactive-workflow.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

// Tests:
// 1. buildDailyBriefing gibt Briefing mit urgent, opportunities, forecast zurück
// 2. Relationship-decay-Alert: Kunden mit > 30d ohne Kontakt erscheinen in urgent[]
// 3. Deal-risk-Alert: Deal mit close_date in 3 Tagen erscheint in urgent[]
// 4. enqueueTask schreibt Task in .agentic/agent-queue.json
// 5. drainProactiveQueue markiert Tasks als done (channel: mcp_tool_response)
// 6. drainProactiveQueue ruft sendTelegram wenn TELEGRAM_BOT_TOKEN gesetzt + channel: telegram
// 7. Leere Pipeline → "No active pipeline." als forecast
// 8. Kein Kunde → leeres Briefing ohne Fehler
```

**Datei:** `__tests__/e2e/deal-room-workflow.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

// Tests:
// 1. buildDealRoom gibt vollständigen DealRoomBrief zurück
// 2. Brief enthält stakeholders (aus graph), dealHealth, revenueSimulation
// 3. Brief enthält recommendedPlaybook wenn matching Playbook vorhanden
// 4. executiveSummary ist non-empty string
// 5. topPriorities array hat mindestens 1 Eintrag
// 6. Kein graph.json → stakeholders leer, kein Fehler
// 7. Kein pipeline.md → dealHealth leer, Simulation zeigt P50=0
// 8. open_deal_room MCP-Tool gibt text-content zurück
```

Vollständige Test-Implementierungen mit memfs-Setup und Fixture-Daten (main_facts.md,
interactions.md, pipeline.md, graph.json) schreiben.

---

## G8 — Goal-Fortschritt nie auto-synchronisiert

### Problem

`dxcrm goal set "Close €500k this quarter"` → Goal mit `progress: 0` angelegt.
Progress wird **nur manuell** via `dxcrm goal update <id> --progress 45` geändert.

Das Plan-Soll: Goal-Engine vergleicht `progress` gegen tatsächlich gewonnene Deals.
`goal_progress_update` TaskType existiert in der Queue aber wird nie enqueued.

### Implementierung

**Datei:** `src/core/goal-engine.ts` — neue Funktion nach dem bestehenden Code:

```typescript
export async function syncGoalProgress(dataDir: string): Promise<void> {
  const goals = readGoals(dataDir);
  const activeGoals = goals.filter((g) => g.status === "active" && g.metric === "revenue");
  if (activeGoals.length === 0) return;

  // Sum won deals within each goal's deadline window
  const customersDir = path.join(dataDir, "customers");
  if (!fs.existsSync(customersDir)) return;

  const slugs = fs.readdirSync(customersDir).filter((s) => {
    try { return fs.statSync(path.join(customersDir, s)).isDirectory(); } catch { return false; }
  });

  let totalWonRevenue = 0;
  for (const slug of slugs) {
    const deals = await readPipeline(dataDir, slug).catch(() => []);
    for (const deal of deals) {
      if (deal.stage === "won" && deal.value) {
        totalWonRevenue += deal.value;
      }
    }
  }

  const updated = goals.map((g) => {
    if (g.status !== "active" || g.metric !== "revenue") return g;
    const newProgress = Math.min(100, Math.round((totalWonRevenue / g.target) * 100));
    if (newProgress !== g.progress) {
      return { ...g, progress: newProgress, updatedAt: new Date().toISOString() };
    }
    return g;
  });

  writeGoals(dataDir, updated);
}
```

**Integration in Daemon `worker.ts`:** `syncGoalProgress` in den täglichen Proactive-CronJob einbauen.

### Tests

- `__tests__/core/goal-engine.test.ts` — neue Tests:
  - `syncGoalProgress` mit won deals → progress erhöht
  - `syncGoalProgress` ohne won deals → progress bleibt 0
  - `syncGoalProgress` über 100% → capped at 100

---

## Architektonische Anmerkungen

### A1 — Tool-Count: 30, nicht 27

Der Plan sagt "27 MCP-Tools". Aktuell sind **30 Tools** registriert (davon 3 nicht im Plan):
`summarize_meeting`, `list_playbooks`, `register_push_subscription`.

Das ist kein Bug — mehr Tools sind besser. Die Harness-Dokumentation (G1) muss aber
die korrekte Zahl 30 verwenden, nicht 27.

### A2 — `simulation-cache.json`

Der Plan erwähnt `.agentic/simulation-cache.json`. Nicht implementiert — Monte Carlo
läuft bei jedem Aufruf (~50ms für 1000 Iterationen × 50 Deals). Bei täglichem
Proactive-Check × N Kunden kann das akkumulieren. Ein TTL-Cache (15 Min) wäre sinnvoll,
ist aber kein Blocker für die sechs Kern-Gaps.

Implementierung: Standard-Pattern `{ inputs_hash: string, result: SimulationResult, generatedAt: string }`,
invalidiert wenn `generatedAt` > 15 Min alt.

### A3 — `send_followup` ActionType fehlt in deal-agent.ts

Der Plan sieht `"send_followup"` als `ActionType` vor. Aktuell implementiert:
`"log_interaction" | "update_deal" | "alert" | "schedule_meeting"`.

`send_followup` würde tatsächlich eine E-Mail senden — das erfordert Gmail OAuth.
Für autonomyLevel `"act"` ist das korrekte Verhalten: E-Mail über Gmail API senden.
Implementierung nach G4 (External Signals) — braucht gleiche HTTP-Infrastruktur.

### A4 — `.agentic/org.json` aus Memory-Stack

Der Memory-Stack in plan-next-dxc.md erwähnt `org.json` für "Org Context Memory".
Diese Datei existiert nicht und wird von keinem Modul geschrieben. Das könnte eine
Zusammenfassung des Org-Intelligence-Ergebnisses sein (gecacht).
Aktuell nicht blockierend — `get_org_intelligence` berechnet on-demand.

---

## Sprint-Empfehlung

Empfohlene Reihenfolge für die Implementierung der 8 Gaps:

```
Tag 1 (Morgen): G1 — Harness-Content v2 (0,5d)
Tag 1 (Mittag): G6 — findPath + warmIntroPath (0,5d)
Tag 2:          G2 + G3 — Proactive Daemon + Queue-Draining (zusammen 2d)
Tag 3:          G4 — External Signals (1,5d)
Tag 4 (Morgen): G5 — GDPR .agentic/-Ebene (0,5d)
Tag 4 (Mittag): G8 — Goal-Progress Auto-Sync (0,5d)
Tag 5:          G7 — E2E Tests D19/D20 (1d)
```

**Commit-Strategie:** Jeder Gap ein separater Commit.
Kein Commit ohne grüne Tests (`npm test` Exit-Code 0).

---

## Erfolgsmetrik nach Abschluss

1. `dxcrm init` auf frischer Maschine → CLAUDE.md listet alle 30 Tools + v2-Muster
2. Daemon läuft über Nacht → morgens liegt Task in `.agentic/agent-queue.json`
3. `TELEGRAM_BOT_TOKEN` gesetzt → Telegram-Nachricht kommt täglich um 07:05
4. `get_org_intelligence("acme-corp")` gibt echte HN-News zurück (wenn Domain bekannt)
5. `dxcrm gdpr erase acme-corp --confirm` → kein Task in Queue mehr, keine Push-Sub mehr
6. `get_relationship_graph("acme-corp")` enthält `warmIntroPaths` wenn Graph > 2 Kontakte
7. `npm test` → ≥ 1700 Tests grün (aktuell 1615 + ~85 neue)
