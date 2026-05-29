# plan-new1.md — Technischer Implementierungsplan: H1–H8 (Must-Haves)
**Role:** Lead Developer · **Basis:** PlanHubSpot.md · **Stand:** 2026-05-29

---

## Executive Technical Decision

Alle 8 Must-Have-Features teilen drei gemeinsame Infrastruktur-Bausteine, die zuerst gebaut werden — damit jedes Feature darauf aufbaut und keine Duplikation entsteht:

1. **Gmail Sender** (`src/sync/gmail-sender.ts`) — Brauchen H1, H7. Einmal bauen.
2. **Variable Interpolation Engine** (`src/core/template-engine.ts`) — Brauchen H1, H2, H4, H7. Einmal bauen.
3. **MCP Tool Count Update** — Nach jedem neuen Tool: `TOOL_COUNT` in `src/mcp/tools/get-capabilities.ts` anpassen.

**Implementierungsreihenfolge** (Dependency-Graph):

```
Shared Infra (Woche 1)
  ↓
H2 Templates → H1 Sequences (beide Wochen 1–2)
H5 HubSpot Import (Woche 2, standalone)
H4 Quote Generator (Woche 2, standalone)
H3 Meeting Scheduler (Woche 3, standalone)
  ↓
H6 Tickets → H7 NPS/CSAT → H8 Knowledge Base (Wochen 3–4)
```

---

## 0. Shared Infrastructure (vor allen Features)

### 0.1 — Gmail Sender (`src/sync/gmail-sender.ts`)

**Zweck:** Emails programmatisch via Gmail API versenden. Wird von H1 (Sequences) und H7 (NPS Surveys) gebraucht.

**Schema:**
```typescript
export interface SendEmailOpts {
  auth: OAuth2Client;       // aus getGmailAuth()
  to: string;               // "alice@acme.com"
  subject: string;
  body: string;             // plain text oder HTML
  replyToMessageId?: string; // für Thread-Fortsetzungen
  cc?: string[];
}

export interface SendEmailResult {
  messageId: string;
  threadId: string;
}
```

**Implementierung:**
```typescript
// src/sync/gmail-sender.ts
import { google } from "googleapis";

export async function sendEmail(opts: SendEmailOpts): Promise<SendEmailResult> {
  const gmail = google.gmail({ version: "v1", auth: opts.auth });

  // RFC 2822 MIME encoding
  const headers = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `Content-Type: text/html; charset=utf-8`,
    ...(opts.replyToMessageId ? [`In-Reply-To: ${opts.replyToMessageId}`, `References: ${opts.replyToMessageId}`] : []),
  ].join("\r\n");

  const raw = Buffer.from(`${headers}\r\n\r\n${opts.body}`)
    .toString("base64url");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      ...(opts.replyToMessageId ? { threadId: opts.replyToMessageId } : {}),
    },
  });

  return {
    messageId: res.data.id ?? "",
    threadId: res.data.threadId ?? "",
  };
}
```

**Tests:** `__tests__/sync/gmail-sender.test.ts`
- Mock `googleapis` → `users.messages.send`
- Test: RFC 2822 header format korrekt
- Test: base64url encoding stimmt
- Test: replyToMessageId wird als In-Reply-To gesetzt
- Test: Fehler werden propagiert (kein silent swallow)

---

### 0.2 — Variable Interpolation Engine (`src/core/template-engine.ts`)

**Zweck:** `{{company}}`, `{{firstName}}`, `{{dealName}}` in Templates ersetzen. Keine externe Abhängigkeit.

**Interface:**
```typescript
export type TemplateVariables = Record<string, string | number | undefined>;

export function interpolate(template: string, vars: TemplateVariables): string;
export function extractVariables(template: string): string[]; // für Validation
export function buildVariablesFromCustomer(dataDir: string, slug: string): Promise<TemplateVariables>;
```

**Implementierung:**
```typescript
// Nur {{key}} Syntax. Kein Handlebars (keine externe Dep).
const VARIABLE_REGEX = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

export function interpolate(template: string, vars: TemplateVariables): string {
  return template.replace(VARIABLE_REGEX, (_, key) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{{${key}}}`; // unresolved = leer lassen, sichtbar halten
  });
}

export function extractVariables(template: string): string[] {
  return [...template.matchAll(VARIABLE_REGEX)].map(m => m[1]!);
}

// Befüllt aus main_facts.md + pipeline.md automatisch
export async function buildVariablesFromCustomer(
  dataDir: string, slug: string
): Promise<TemplateVariables> {
  const facts = await readMainFacts(dataDir, slug).catch(() => null);
  return {
    company: facts?.name ?? slug,
    domain: facts?.domain ?? "",
    email: facts?.email ?? "",
    stage: facts?.relationship_stage ?? "",
    slug,
    date: new Date().toLocaleDateString("de-DE"),
    year: new Date().getFullYear(),
  };
}
```

**Tests:** `__tests__/core/template-engine.test.ts`
- 8 Unit-Tests: basic substitution, missing var bleibt `{{var}}`, nested text, number values, extractVariables, buildVariablesFromCustomer mit memfs

---

## H2 — Email Templates Vault (Woche 1, vor H1)

### Datenmodell

**Datei:** `.agentic/templates/{category}/{slug}.md`

```markdown
---
id: enterprise-intro
subject: "Quick question about {{company}}"
category: outreach
variables:
  - company
  - firstName
  - senderName
language: de
createdAt: '2026-05-29'
---

Hi {{firstName}},

ich habe {{company}} auf meinem Radar — konkret interessiert mich, wie ihr Team ...
```

**Schema:** `src/schemas/email-template.ts`
```typescript
export const EmailTemplateSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  category: z.string().default("general"),
  variables: z.array(z.string()).default([]),
  language: z.string().default("de"),
  createdAt: z.string(),
});
export type EmailTemplate = z.infer<typeof EmailTemplateSchema> & { body: string };
```

### File System Layer: `src/fs/template-store.ts`

```typescript
export function templatesDir(dataDir: string): string
export function listTemplates(dataDir: string): EmailTemplate[]
export function getTemplate(dataDir: string, id: string): EmailTemplate | null
export function writeTemplate(dataDir: string, tmpl: EmailTemplate): void
export function deleteTemplate(dataDir: string, id: string): void
```

**Implementierung:** Gray-matter zum Parsen (bereits als Dependency vorhanden).

### MCP Tools (3 neue Tools)

**`src/mcp/tools/list-email-templates.ts`**
```typescript
// Input: { category?: string }
// Output: EmailTemplate[] (ohne body für Übersicht)
```

**`src/mcp/tools/get-email-template.ts`**
```typescript
// Input: { id: string }
// Output: { template: EmailTemplate, preview?: string }
```

**`src/mcp/tools/draft-email.ts`**
```typescript
// Input: { slug: string, templateId: string, overrides?: Record<string,string> }
// Output: { subject: string, body: string, to: string, resolvedVariables: Record<string,string> }
// Kombiniert buildVariablesFromCustomer() + overrides + interpolate()
// Gibt ENTWURF zurück — kein automatischer Versand
```

### CLI: `src/commands/template.ts`

```
dxcrm template list [--category <cat>]
dxcrm template create <id> [--category <cat>]   # öffnet $EDITOR
dxcrm template preview <id> --slug <slug>        # zeigt interpolierten Output
dxcrm template delete <id>
```

### Tests

**`__tests__/commands/template.test.ts`** (memfs, 10 Tests)
- list returns all templates
- get returns body + frontmatter
- create writes valid YAML frontmatter
- preview interpolates variables from customer
- delete removes file
- missing template returns null (kein throw)

**`__tests__/mcp/tools/draft-email.test.ts`** (8 Tests)
- variables aus main_facts.md werden befüllt
- overrides überschreiben auto-variables
- missing variable bleibt `{{var}}` im Output (kein throw)
- subject wird auch interpoliert

---

## H1 — Email Sequences Engine (Woche 1–2)

### Datenmodell

**Sequence-Definition:** `.agentic/sequences/{id}.yaml`
```yaml
id: enterprise-outreach
name: Enterprise Outreach (5 steps)
steps:
  - day: 0
    templateId: enterprise-intro
    skipIfReplied: true
  - day: 3
    templateId: value-prop-followup
    skipIfReplied: true
  - day: 7
    templateId: case-study
    skipIfReplied: true
  - day: 14
    templateId: breakup
    skipIfReplied: false
createdAt: '2026-05-29'
```

**Enrollment State:** `.agentic/sequence-enrollments.json`
```typescript
export interface SequenceEnrollment {
  id: string;               // enrollment_${timestamp}
  sequenceId: string;
  slug: string;             // customer slug
  contactEmail: string;
  enrolledAt: string;       // ISO
  status: "active" | "paused" | "completed" | "bounced";
  currentStep: number;      // 0-indexed
  lastSentAt?: string;
  lastRepliedAt?: string;
  stepsCompleted: number[];
}
```

**Schema:** `src/schemas/sequence.ts`
```typescript
export const SequenceStepSchema = z.object({
  day: z.number().int().min(0),
  templateId: z.string().min(1),
  skipIfReplied: z.boolean().default(true),
});

export const SequenceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  steps: z.array(SequenceStepSchema).min(1),
  createdAt: z.string(),
});

export const SequenceEnrollmentSchema = z.object({
  id: z.string(),
  sequenceId: z.string(),
  slug: z.string(),
  contactEmail: z.string().email(),
  enrolledAt: z.string(),
  status: z.enum(["active", "paused", "completed", "bounced"]),
  currentStep: z.number().int().min(0),
  stepsCompleted: z.array(z.number()),
  lastSentAt: z.string().optional(),
  lastRepliedAt: z.string().optional(),
});
```

### File System Layer: `src/fs/sequence-store.ts`

```typescript
export function listSequences(dataDir: string): SequenceDefinition[]
export function getSequence(dataDir: string, id: string): SequenceDefinition | null
export function writeSequence(dataDir: string, seq: SequenceDefinition): void
export function readEnrollments(dataDir: string): SequenceEnrollment[]
export async function writeEnrollment(dataDir: string, e: SequenceEnrollment): Promise<void>
export async function updateEnrollment(dataDir: string, id: string, updates: Partial<SequenceEnrollment>): Promise<void>
```

### Core Engine: `src/core/sequence-engine.ts`

**Hauptfunktion:**
```typescript
export async function processSequenceStep(
  dataDir: string,
  enrollment: SequenceEnrollment,
  today: string
): Promise<"sent" | "skipped_replied" | "completed" | "no_step_due">

export async function runSequenceCycle(
  dataDir: string,
  today: string
): Promise<{ processed: number; sent: number; completed: number; errors: string[] }>
```

**Logik von `processSequenceStep`:**
1. Lade `SequenceDefinition` für `enrollment.sequenceId`
2. Bestimme `nextStep = enrollment.steps[enrollment.currentStep]`
3. Wenn kein nextStep → markiere `completed`, return
4. Berechne `dueDate = addDays(enrollment.enrolledAt, nextStep.day)`
5. Wenn `today < dueDate` → `no_step_due`, return
6. Wenn `nextStep.skipIfReplied && enrollment.lastRepliedAt` → skip, advance step, return
7. Lade Template via `getTemplate(dataDir, nextStep.templateId)`
8. Baue Variables via `buildVariablesFromCustomer(dataDir, enrollment.slug)`
9. Interpolate subject + body
10. Falls Gmail-Auth verfügbar: `sendEmail(...)`, sonst: enqueue als `mcp_tool_response`-Task
11. Update Enrollment: `lastSentAt`, `stepsCompleted`, `currentStep + 1`

**Replied-Detection:** Gmail Sync schreibt `lastRepliedAt` wenn eine Antwort auf eine gesendete Message-ID eingeht. Integration: `gmail-sync.ts` prüft bei Inbox-Nachrichten, ob `inReplyTo` einer gesendeten Sequence-Email entspricht → `updateEnrollment`.

### Daemon Integration

**`src/daemon/worker.ts` — neuer CronJob (alle 6h):**
```typescript
new CronJob("0 */6 * * *", async () => {
  const { runSequenceCycle } = await import("../core/sequence-engine.js");
  const today = new Date().toISOString().slice(0, 10);
  const result = await runSequenceCycle(DATA_DIR, today);
  process.stderr.write(`[sequences] ${result.sent} sent, ${result.completed} completed\n`);
}, null, true, undefined, null, false, undefined, false, true);
```

### MCP Tools (4 neue Tools)

**`src/mcp/tools/enroll-in-sequence.ts`**
```typescript
// Input: { slug: string, contactEmail: string, sequenceId: string }
// Output: { enrollmentId: string, sequenceName: string, totalSteps: number }
// Validiert: sequence existiert, Template für Step 0 existiert
```

**`src/mcp/tools/list-sequence-enrollments.ts`**
```typescript
// Input: { slug?: string, status?: "active"|"paused"|"completed" }
// Output: SequenceEnrollment[] mit sequenceName dazu
```

**`src/mcp/tools/unenroll-from-sequence.ts`**
```typescript
// Input: { enrollmentId: string }
// Output: { success: boolean }
```

**`src/mcp/tools/list-sequences.ts`**
```typescript
// Input: {}
// Output: { sequences: Array<{ id, name, stepCount, enrollmentCount }> }
```

### CLI: `src/commands/sequence.ts`

```
dxcrm sequence list
dxcrm sequence create <id>              # öffnet EDITOR mit YAML-Template
dxcrm sequence enroll <slug> --email <email> --sequence <id>
dxcrm sequence status [--slug <slug>]
dxcrm sequence run [--dry-run]          # manuelles Triggern des Daemon-Jobs
```

### Tests

**`__tests__/core/sequence-engine.test.ts`** (memfs, 15 Tests)
- `processSequenceStep`: no_step_due wenn Tag zu früh
- `processSequenceStep`: sent wenn Tag genau erreicht
- `processSequenceStep`: skipped wenn replied + skipIfReplied=true
- `processSequenceStep`: completed nach letztem Step
- `runSequenceCycle`: verarbeitet mehrere Enrollments
- `runSequenceCycle`: isoliert Fehler pro Enrollment
- Reply-detection: `lastRepliedAt` gesetzt → Step übersprungen

**`__tests__/mcp/tools/enroll-in-sequence.test.ts`** (6 Tests)
- Enrollment wird in enrollments.json gespeichert
- Fehler wenn sequence nicht existiert
- Fehler wenn templateId des ersten Steps nicht existiert

---

## H5 — HubSpot CSV Import (Woche 2, standalone)

### Analyse der HubSpot-Export-Formate

HubSpot exportiert 4 CSVs:
- `contacts.csv`: firstname, lastname, email, phone, company, website, lifecyclestage, hs_lead_status, notes_last_updated
- `companies.csv`: name, domain, industry, numberofemployees, annualrevenue, country
- `deals.csv`: dealname, amount, dealstage, closedate, pipeline, associated_company
- `engagements.csv`: engagement_type, hs_timestamp, hs_body_preview, associated_contact_email

**Bereits vorhanden:** `dxcrm import --from hubspot` ist in `import.ts` registriert (nutzt LLM-Field-Mapping für generic CSV). **Problem:** Kein HubSpot-spezifisches Handling für alle 4 CSV-Typen + Deal-Rekonstruktion.

### Implementierung: `src/commands/import-hubspot.ts`

```typescript
export interface HubSpotImportResult {
  companiesProcessed: number;
  contactsImported: number;
  dealsImported: number;
  engagementsImported: number;
  errors: string[];
}

export async function runHubSpotCsvImport(
  exportDir: string,
  dataDir: string,
  opts: { dryRun?: boolean }
): Promise<HubSpotImportResult>
```

**Logik:**
1. Detecte CSVs im `exportDir` (companies, contacts, deals, engagements)
2. **Phase 1 — Companies:** Für jede Company: `ensureCustomer(dataDir, name, domain, email)`. Baue Map `companyName → slug`
3. **Phase 2 — Contacts:** Resolve Company → slug. Füge E-Mail/Phone als `email`, `phone` in `main_facts.md` hinzu (via `update_customer_facts`)
4. **Phase 3 — Deals:** Resolve Company → slug. Schreibe Deal in `pipeline.md` via `upsertDeal()`. HubSpot Stages → unsere Stages:
   ```typescript
   const STAGE_MAP: Record<string, PipelineDeal["stage"]> = {
     "appointmentscheduled": "qualified",
     "qualifiedtobuy": "qualified",
     "presentationscheduled": "proposal",
     "decisionmakerboughtin": "negotiation",
     "contractsent": "negotiation",
     "closedwon": "won",
     "closedlost": "lost",
   };
   ```
5. **Phase 4 — Engagements:** Resolve Contact Email → slug. `appendInteraction()` für jedes Engagement. EngagementType-Mapping:
   ```typescript
   const TYPE_MAP: Record<string, InteractionEntry["type"]> = {
     "NOTE": "Note", "CALL": "Call", "EMAIL": "Email",
     "MEETING": "Meeting", "TASK": "Note",
   };
   ```
6. Idempotenz: `sourceRef = hubspot://engagement/${id}` — doppelter Import wird erkannt

**Integration in `src/commands/import.ts`:**
```typescript
// Zeile ~293: HubSpot-Branch hinzufügen
if (opts.from === "hubspot" && sourcePath) {
  const { runHubSpotCsvImport } = await import("./import-hubspot.js");
  return runHubSpotCsvImport(sourcePath, dir, opts);
}
```

### CLI-Erweiterung

```
dxcrm import --from hubspot ./hs-export/          # Verzeichnis mit 4 CSVs
dxcrm import --from hubspot ./contacts.csv        # einzelne CSV (LLM-mapping)
dxcrm import --from hubspot ./hs-export/ --dry-run
```

### Tests

**`__tests__/commands/import-hubspot.test.ts`** (memfs, 12 Tests)
- Companies → customers erstellt
- Deals → pipeline.md korrekt geschrieben mit Stage-Mapping
- Engagements → interactions.md korrekt
- `closedwon` → stage `won`
- Doppelter Import idempotent (kein Duplikat)
- Leeres CSV → kein Fehler
- Kein `companies.csv` → trotzdem Contacts importiert (fallback zu Company-Name)

---

## H4 — Quote & Invoice Generator (Woche 2)

### Datenmodell

**Quote-Config:** `.agentic/quote-config.yaml`
```yaml
companyName: "Datasynx GmbH"
companyAddress: "Musterstraße 1, 10115 Berlin"
vatId: "DE123456789"
currency: EUR
paymentTerms: "Zahlungsziel 30 Tage netto"
logoPath: ".agentic/logo.png"       # optional
footerText: "Alle Preise zzgl. MwSt."
```

**Quote-Template:** `.agentic/quote-template.md` (Markdown + Handlebars-ähnlich, aber unser engine)
```markdown
# Angebot {{quoteNumber}}

**An:** {{customerName}}, {{customerAddress}}

**Datum:** {{date}}
**Gültig bis:** {{validUntil}}

## Leistungen

| Position | Beschreibung | Menge | Preis | Gesamt |
|----------|-------------|-------|-------|--------|
{{lineItemRows}}

**Nettobetrag:** {{subtotal}}
**MwSt. (19%):** {{vat}}
**Gesamtbetrag:** {{total}}

---
{{paymentTerms}}
```

**Quote-Instanz:** `.agentic/quotes/{quoteNumber}.json`
```typescript
export interface QuoteLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Quote {
  quoteNumber: string;       // Q-2026-001
  slug: string;
  dealName: string;
  lineItems: QuoteLineItem[];
  subtotal: number;
  vatPercent: number;
  vat: number;
  total: number;
  currency: string;
  createdAt: string;
  validUntilDays: number;    // default: 30
  status: "draft" | "sent" | "viewed" | "accepted" | "declined";
  viewedAt?: string;
  acceptedAt?: string;
  htmlPath?: string;
}
```

### Core: `src/core/quote-generator.ts`

```typescript
export interface GenerateQuoteInput {
  slug: string;
  dealName: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number }>;
  vatPercent?: number;         // default 19
  validUntilDays?: number;     // default 30
  currency?: string;           // default aus main_facts.md oder EUR
}

export async function generateQuote(
  dataDir: string,
  input: GenerateQuoteInput
): Promise<Quote>
```

**Logik:**
1. Lade `quote-config.yaml` (Fallback: leere Werte)
2. Berechne `subtotal`, `vat`, `total`
3. Generiere `quoteNumber`: `Q-${year}-${String(nextQuoteNumber).padStart(3, "0")}`
4. Schreibe Quote-JSON in `.agentic/quotes/`
5. Generiere HTML aus `quote-template.md` + `interpolate()`
6. Speichere HTML in `.agentic/quotes/{quoteNumber}.html`
7. Optional: Wenn `dxcrm server` läuft → generiere Share-Link: `http://localhost:PORT/quotes/{quoteNumber}`

**Quote-Tracking:** In `src/commands/server.ts` neuer Express-Route:
```typescript
app.get("/quotes/:quoteNumber", async (req, res) => {
  const quote = readQuote(DATA_DIR, req.params.quoteNumber);
  if (!quote) return res.status(404).send("Not found");
  // Mark as viewed on first access
  if (quote.status === "sent") {
    await updateQuoteStatus(DATA_DIR, quote.quoteNumber, "viewed");
    enqueueTask(DATA_DIR, { type: "quote_viewed", slug: quote.slug, ... });
  }
  res.sendFile(path.join(DATA_DIR, ".agentic", "quotes", `${quote.quoteNumber}.html`));
});
```

**TaskType-Erweiterung** in `proactive-agent.ts`:
```typescript
| "quote_viewed"   // Neuer Task-Typ für Quote-Tracking
| "quote_accepted"
```

### MCP Tools (2 neue Tools)

**`src/mcp/tools/generate-quote.ts`**
```typescript
// Input: {
//   slug: string,
//   dealName: string,
//   lineItems: Array<{ description: string, quantity: number, unitPrice: number }>,
//   vatPercent?: number,
//   validUntilDays?: number
// }
// Output: {
//   quoteNumber: string,
//   htmlPath: string,
//   shareUrl?: string,   // wenn server läuft
//   total: number,
//   currency: string
// }
```

**`src/mcp/tools/get-quote-status.ts`**
```typescript
// Input: { quoteNumber?: string, slug?: string }
// Output: Quote[] mit status, viewedAt, acceptedAt
```

### CLI: `src/commands/quote.ts`

```
dxcrm quote generate <slug> --deal <dealName> --items "Consulting 1 5000,Support 12 500"
dxcrm quote list [--slug <slug>]
dxcrm quote open <quoteNumber>        # öffnet HTML im Browser
dxcrm quote send <quoteNumber> --to <email>  # sendet via Gmail
```

### Tests

**`__tests__/core/quote-generator.test.ts`** (memfs, 10 Tests)
- quote number wird korrekt inkrementiert (Q-2026-001, Q-2026-002)
- subtotal/vat/total korrekt berechnet
- HTML enthält Firmendaten aus quote-config.yaml
- Quote wird in .agentic/quotes/ gespeichert
- validUntil = createdAt + validUntilDays

---

## H3 — Meeting Scheduler Integration (Woche 3)

### Design-Entscheid

**Primär:** Calendly v2 API (meiste Teams haben schon Calendly)
**Sekundär:** Cal.com (open source, self-hostable) — via `CAL_COM_API_KEY`
**Kein eigener Scheduler** (zu komplex für Must-Have)

### `src/sync/calendly.ts`

```typescript
export interface CalendlyEventType {
  uri: string;
  slug: string;
  name: string;
  duration: number;        // Minuten
  schedulingUrl: string;   // direkte Booking-URL
  active: boolean;
}

export interface CalendlyScheduledEvent {
  uri: string;
  name: string;
  startTime: string;       // ISO
  endTime: string;
  inviteeName: string;
  inviteeEmail: string;
  status: "active" | "canceled";
}

export async function listEventTypes(apiKey: string): Promise<CalendlyEventType[]>

export async function getSchedulingLink(
  apiKey: string,
  eventTypeSlug: string,
  prefill?: { name?: string; email?: string }
): Promise<string>

export async function listScheduledEvents(
  apiKey: string,
  since?: string   // ISO — nur Events nach diesem Datum
): Promise<CalendlyScheduledEvent[]>
```

### `src/sync/calendly-webhook-handler.ts`

Wenn ein Meeting gebucht wird → auto `log_interaction`:
```typescript
export async function handleCalendlyWebhook(
  payload: CalendlyWebhookPayload,
  dataDir: string
): Promise<void>
// Mapped inviteeEmail → customer slug via main_facts.md email-Feld
// Schreibt log_interaction: type="Meeting", summary=event.name, date=startTime.slice(0,10)
```

**Integration:** Extend `webhook-receiver.ts` mit Route `POST /webhooks/calendly`.

### Calendly Config: `.agentic/integrations/calendly.yaml`
```yaml
apiKey: "{{ CALENDLY_API_KEY }}"   # aus env var
defaultEventType: "30min"
autoLogMeetings: true
```

### MCP Tool (1 neues Tool)

**`src/mcp/tools/get-booking-link.ts`**
```typescript
// Input: {
//   slug: string,
//   eventType?: string,        // "30min" | "60min" | custom slug
//   prefillName?: boolean      // befüllt Name aus main_facts.md
// }
// Output: {
//   bookingUrl: string,
//   eventType: string,
//   duration: number
// }
```

### CLI: `src/commands/calendar.ts` (Erweiterung)

```
dxcrm calendar booking-link <slug> [--event-type 30min]
dxcrm calendar setup --provider calendly --api-key <key>
dxcrm calendar sync                    # importiert vergangene Meetings als Interactions
```

### Tests

**`__tests__/sync/calendly.test.ts`** (Mock fetch, 8 Tests)
- listEventTypes parsed API response korrekt
- getSchedulingLink gibt URL zurück
- handleCalendlyWebhook → appendInteraction aufgerufen
- inviteeEmail ohne matching customer → kein Fehler (graceful)

---

## H6 — Ticket Management System (Woche 3)

### Datenmodell

**Datei:** `customers/{slug}/tickets.md` (analog zu pipeline.md)

```markdown
# Tickets — Acme Corp

| ID | Title | Status | Priority | Assignee | Created | SLA Due | Resolved |
|----|-------|--------|----------|----------|---------|---------|---------|
| T-001 | API timeout on /sync | in-progress | high | alice | 2026-05-28 | 2026-05-29 | |
| T-002 | Missing invoice Q-2026-001 | open | normal | | 2026-05-29 | 2026-05-30 | |
```

**Schema:** `src/schemas/ticket.ts`
```typescript
export const TicketStatusSchema = z.enum(["open", "in-progress", "waiting", "resolved", "closed"]);
export const TicketPrioritySchema = z.enum(["urgent", "high", "normal", "low"]);

export const TicketSchema = z.object({
  id: z.string().regex(/^T-\d{3,}$/),
  title: z.string().min(1),
  status: TicketStatusSchema,
  priority: TicketPrioritySchema,
  assignee: z.string().optional(),
  created: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slaDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  resolved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().optional(),
});
export type Ticket = z.infer<typeof TicketSchema>;
```

**SLA-Regeln:** `.agentic/sla-rules.yaml`
```yaml
rules:
  - priority: urgent
    resolveDays: 1
  - priority: high
    resolveDays: 2
  - priority: normal
    resolveDays: 5
  - priority: low
    resolveDays: 10
businessHoursOnly: false
```

### File System: `src/fs/ticket-writer.ts`

```typescript
const TICKET_HEADER = "# Tickets\n\n";
const TABLE_HEADER = `| ID | Title | Status | Priority | Assignee | Created | SLA Due | Resolved |
|----|-------|--------|----------|----------|---------|---------|---------|`;

export async function readTickets(dataDir: string, slug: string): Promise<Ticket[]>
export async function upsertTicket(dataDir: string, slug: string, ticket: Ticket): Promise<void>
export function nextTicketId(tickets: Ticket[]): string
// nextTicketId: findet höchste Nummer, gibt T-{n+1} zurück (T-001 bei leer)
```

**Implementierung analog zu `pipeline-writer.ts`:** Markdown-Table parsen/serialisieren. Gleiche `escapeMd` und Parsinglogik.

### Core: `src/core/sla-engine.ts`

```typescript
export interface SlaRule {
  priority: Ticket["priority"];
  resolveDays: number;
}

export function calcSlaDue(createdDate: string, priority: Ticket["priority"], rules: SlaRule[]): string
// Gibt YYYY-MM-DD zurück

export function isSlaBreach(ticket: Ticket, today: string): boolean
// true wenn status != resolved|closed UND slaDue < today

export async function checkSlaBreaches(
  dataDir: string,
  today: string
): Promise<Array<{ slug: string; ticket: Ticket }>>
// Iteriert alle customers, liest tickets.md, findet Breaches
```

### Daemon Integration

```typescript
// Neuer CronJob in worker.ts (täglich 08:00)
new CronJob("0 8 * * *", async () => {
  const { checkSlaBreaches } = await import("../core/sla-engine.js");
  const today = new Date().toISOString().slice(0, 10);
  const breaches = await checkSlaBreaches(DATA_DIR, today);
  for (const { slug, ticket } of breaches) {
    await enqueueTask(DATA_DIR, {
      type: "sla_breach_alert",
      slug,
      priority: "urgent",
      payload: { ticketId: ticket.id, title: ticket.title, slaDue: ticket.slaDue },
      scheduledFor: new Date().toISOString(),
      channel: defaultChannel(),
    });
  }
}, null, true, undefined, null, false, undefined, false, true);
```

**TaskType-Erweiterung:**
```typescript
| "sla_breach_alert"
| "ticket_created"
```

### MCP Tools (4 neue Tools)

**`src/mcp/tools/create-ticket.ts`**
```typescript
// Input: { slug: string, title: string, description?: string, priority?: "urgent"|"high"|"normal"|"low", assignee?: string }
// Output: { ticket: Ticket }
// Auto-berechnet slaDue aus SLA-Regeln
```

**`src/mcp/tools/update-ticket.ts`**
```typescript
// Input: { slug: string, ticketId: string, status?: TicketStatus, assignee?: string, notes?: string }
// Output: { ticket: Ticket }
// Bei status=resolved: setzt resolved=today, enqueued task für Audit-Log
```

**`src/mcp/tools/list-tickets.ts`**
```typescript
// Input: { slug?: string, status?: TicketStatus, priority?: TicketPriority, assignee?: string }
// Output: Ticket[] sortiert nach priority, dann created
```

**`src/mcp/tools/close-ticket.ts`**
```typescript
// Input: { slug: string, ticketId: string, resolution?: string }
// Output: { ticket: Ticket }
// Setzt status=closed, resolved=today, schreibt resolution als appendInteraction
```

### CLI: `src/commands/ticket.ts`

```
dxcrm ticket list [--slug <slug>] [--status open|in-progress] [--priority urgent]
dxcrm ticket create <slug> --title "API issue" [--priority high] [--assignee alice]
dxcrm ticket update <ticketId> --status in-progress [--slug <slug>]
dxcrm ticket close <ticketId> [--slug <slug>] [--resolution "Fixed by..."]
```

### Tests

**`__tests__/fs/ticket-writer.test.ts`** (memfs, 12 Tests)
- readTickets parsed alle Spalten korrekt
- upsertTicket erstellt neues Ticket mit nextTicketId
- upsertTicket updated existierendes (gleiche ID)
- nextTicketId: T-001 bei leer, T-004 bei T-001/T-002/T-003
- escapeMd behandelt Pipes in Titles korrekt

**`__tests__/core/sla-engine.test.ts`** (8 Tests)
- calcSlaDue: urgent = +1 Tag, normal = +5 Tage
- isSlaBreach: true wenn slaDue < today AND nicht resolved
- checkSlaBreaches findet Tickets über mehrere Kunden

**`__tests__/mcp/tools/create-ticket.test.ts`** (6 Tests)
- Ticket wird in tickets.md geschrieben
- SLA Due wird berechnet
- Priority default = normal

---

## H7 — NPS / CSAT Survey Engine (Woche 4)

### Design-Entscheid

**Response-Collection:** Token-basierte Links im E-Mail + Response-Handler im HTTP-Server.
- Survey-Email enthält Links: `http://your-domain/survey/respond?token=xxx&score=9`
- Ohne laufenden Server: Token-URL wird generiert, User kann manual antworten per Reply
- Mit laufendem Server (`dxcrm server`): automatische Collection

### Datenmodell

**Survey-Definition:** `.agentic/surveys/{id}.yaml`
```yaml
id: quarterly-nps-q2-2026
type: nps              # nps | csat | ces
question: "Wie wahrscheinlich ist es, dass du uns weiterempfiehlst?"
scale:
  min: 0
  max: 10
includeComment: true
commentPrompt: "Was ist der Hauptgrund für deine Bewertung?"
createdAt: '2026-05-29'
```

**Survey-Response:** `.agentic/survey-responses/{surveyId}/{slug}_{contactEmail}_{timestamp}.json`
```typescript
export interface SurveyResponse {
  surveyId: string;
  slug: string;
  contactEmail: string;
  score: number;
  comment?: string;
  respondedAt: string;
  token: string;
  sentAt: string;
}
```

**NPS-Score in `health.json`:**
Extend `HealthSnapshot` um:
```typescript
nps?: {
  score: number;         // -100 to +100 (Net Promoter Score)
  respondents: number;
  lastSurveyAt: string;
}
```

### Core: `src/core/survey-engine.ts`

```typescript
export function generateSurveyToken(slug: string, contactEmail: string, surveyId: string): string
// crypto.createHmac("sha256", SURVEY_SECRET).update(`${slug}:${contactEmail}:${surveyId}`).digest("hex").slice(0, 16)

export function buildSurveyEmail(
  survey: SurveyDefinition,
  serverUrl: string,
  token: string
): { subject: string; body: string }
// Baut HTML-Email mit 0–10 Buttons als Links

export async function recordSurveyResponse(
  dataDir: string,
  token: string,
  score: number,
  comment?: string
): Promise<SurveyResponse>

export async function calcNpsScore(responses: SurveyResponse[]): Promise<number>
// Promoters (9-10) - Detractors (0-6) / Total * 100

export async function updateHealthWithNps(
  dataDir: string,
  slug: string
): Promise<void>
// Liest alle Responses für slug, berechnet NPS, schreibt in health.json
```

### HTTP-Server Integration: Extend `src/commands/server.ts`

```typescript
// GET /survey/respond?token=xxx&score=7&comment=...
app.get("/survey/respond", async (req, res) => {
  const { token, score, comment } = req.query;
  await recordSurveyResponse(DATA_DIR, token, parseInt(score), comment);
  res.send("<html><body>Danke für dein Feedback!</body></html>");
});
```

### MCP Tools (2 neue Tools)

**`src/mcp/tools/send-nps-survey.ts`**
```typescript
// Input: { slug: string, contactEmail: string, surveyId: string, serverUrl?: string }
// Output: { sent: boolean, previewUrl: string, token: string }
// Versendet Email via Gmail-Auth (falls verfügbar), gibt sonst Link zurück
```

**`src/mcp/tools/get-survey-results.ts`**
```typescript
// Input: { slug?: string, surveyId?: string }
// Output: { responses: SurveyResponse[], npsScore?: number, avgScore: number }
```

### CLI: `src/commands/survey.ts`

```
dxcrm survey create <id> [--type nps|csat]
dxcrm survey send <surveyId> --slug <slug> --email <contact@email.com>
dxcrm survey results [--slug <slug>] [--survey <surveyId>]
```

### Tests

**`__tests__/core/survey-engine.test.ts`** (10 Tests)
- generateSurveyToken ist deterministisch
- buildSurveyEmail enthält 0–10 Score-Links
- calcNpsScore: Promoters/Detractors/Passives korrekt berechnet
- NPS = -100 wenn alle Detractors
- NPS = +100 wenn alle Promoters
- recordSurveyResponse schreibt JSON-Datei
- updateHealthWithNps schreibt nps in health.json

---

## H8 — Knowledge Base (Woche 4)

### Datenmodell

**Artikel:** `.agentic/knowledge-base/{category}/{slug}.md`

```markdown
---
id: troubleshoot-api-timeout
title: "API Timeouts beheben"
category: troubleshooting
tags:
  - api
  - performance
public: true
createdAt: '2026-05-29'
updatedAt: '2026-05-29'
sourceTicketId: T-001      # optional: aus welchem Ticket destilliert
---

## Problem

API-Calls auf `/sync` timeout nach 30 Sekunden wenn...

## Lösung

1. Prüfe DXCRM_DAEMON_INTERVAL...
```

**Schema:** `src/schemas/kb-article.ts`
```typescript
export const KbArticleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.string().default("general"),
  tags: z.array(z.string()).default([]),
  public: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
  sourceTicketId: z.string().optional(),
});
export type KbArticle = z.infer<typeof KbArticleSchema> & { body: string };
```

### File System: `src/fs/knowledge-base.ts`

```typescript
export function kbDir(dataDir: string): string
// → path.join(dataDir, ".agentic", "knowledge-base")

export function listKbArticles(dataDir: string, opts?: { category?: string; publicOnly?: boolean }): KbArticle[]
export function getKbArticle(dataDir: string, id: string): KbArticle | null
export function writeKbArticle(dataDir: string, article: KbArticle): void
export function deleteKbArticle(dataDir: string, id: string): void
```

### Vector Search Integration: `src/core/lancedb.ts` (Erweiterung)

**Neue Tabelle `kb_articles`** (analog zu customer-Tabelle):
```typescript
const KB_TABLE_SCHEMA = new Schema([
  new Field("article_id", new Utf8(), false),
  new Field("text", new Utf8(), false),
  new Field("category", new Utf8(), false),
  new Field("public", new Utf8(), false),     // "true"/"false" (Arrow Utf8)
  new Field("vector", new FixedSizeList(384, ...), false),
]);

export async function indexKbArticle(dataDir: string, article: KbArticle): Promise<void>

export async function searchKb(
  dataDir: string,
  query: string,
  opts?: { limit?: number; publicOnly?: boolean }
): Promise<Array<{ articleId: string; score: number; title: string; excerpt: string }>>
```

### Core: `src/core/kb-generator.ts`

```typescript
export async function createKbArticleFromTicket(
  dataDir: string,
  slug: string,
  ticketId: string
): Promise<KbArticle>
// 1. readTickets(dataDir, slug) → findet Ticket
// 2. readInteractions (findet Interactions nach ticket.created mit Erwähnung von ticketId)
// 3. LLM-Prompt: "Destilliere diese Support-Interaktion als Knowledge-Base-Artikel"
// 4. writeKbArticle + indexKbArticle
```

### Web-Server: `dxcrm kb serve`

Extend `src/commands/server.ts` mit KB-Route:
```typescript
app.get("/kb", (req, res) => { /* Article index */ });
app.get("/kb/:id", (req, res) => { /* Einzelartikel */ });
// CSS: minimalst, responsive, keine externe Dep.
```

### MCP Tools (2 neue Tools)

**`src/mcp/tools/search-knowledge-base.ts`**
```typescript
// Input: { query: string, limit?: number }
// Output: Array<{ articleId: string, title: string, excerpt: string, score: number, category: string }>
// Nutzt Vector-Search, fällt zurück auf text/grep wenn LanceDB nicht verfügbar
```

**`src/mcp/tools/create-kb-article.ts`**
```typescript
// Input: {
//   title: string,
//   body: string,
//   category?: string,
//   tags?: string[],
//   public?: boolean,
//   sourceTicketId?: string    // wenn aus Ticket generiert
// }
// Output: { article: KbArticle }
```

### CLI: `src/commands/kb.ts`

```
dxcrm kb list [--category troubleshooting] [--public]
dxcrm kb create <slug>                    # öffnet $EDITOR mit YAML-Template
dxcrm kb search <query>                   # vector search
dxcrm kb from-ticket <ticketId> --slug <slug>   # AI-generiert aus Ticket
dxcrm kb serve [--port 3001]             # statisches HTML-Portal
```

### Tests

**`__tests__/fs/knowledge-base.test.ts`** (memfs, 10 Tests)
- listKbArticles returned alle Artikel
- publicOnly filtert korrekt
- category-Filter korrekt
- writeKbArticle schreibt mit grau-matter
- getKbArticle parst body korrekt
- deleteKbArticle entfernt Datei

**`__tests__/mcp/tools/search-knowledge-base.test.ts`** (6 Tests)
- LanceDB gemocked → returned Ergebnisse
- Fallback auf grep wenn LanceDB leer
- Leere Query → sinnvoller Fehler

---

## Gesamtübersicht: Neue Dateien

```
src/
├── schemas/
│   ├── email-template.ts       (H2)
│   ├── sequence.ts             (H1)
│   ├── ticket.ts               (H6)
│   ├── kb-article.ts           (H8)
│   └── survey.ts               (H7)
├── core/
│   ├── template-engine.ts      (Shared)
│   ├── sequence-engine.ts      (H1)
│   ├── quote-generator.ts      (H4)
│   ├── sla-engine.ts           (H6)
│   ├── survey-engine.ts        (H7)
│   └── kb-generator.ts         (H8)
├── fs/
│   ├── template-store.ts       (H2)
│   ├── sequence-store.ts       (H1)
│   ├── ticket-writer.ts        (H6)
│   ├── knowledge-base.ts       (H8)
│   └── quote-store.ts          (H4)
├── sync/
│   ├── gmail-sender.ts         (Shared)
│   ├── calendly.ts             (H3)
│   ├── calendly-webhook-handler.ts  (H3)
│   └── survey-sender.ts        (H7)
├── mcp/tools/
│   ├── list-email-templates.ts       (H2) → Tool #31
│   ├── get-email-template.ts         (H2) → Tool #32
│   ├── draft-email.ts                (H2) → Tool #33
│   ├── enroll-in-sequence.ts         (H1) → Tool #34
│   ├── list-sequence-enrollments.ts  (H1) → Tool #35
│   ├── unenroll-from-sequence.ts     (H1) → Tool #36
│   ├── list-sequences.ts             (H1) → Tool #37
│   ├── get-booking-link.ts           (H3) → Tool #38
│   ├── generate-quote.ts             (H4) → Tool #39
│   ├── get-quote-status.ts           (H4) → Tool #40
│   ├── create-ticket.ts              (H6) → Tool #41
│   ├── update-ticket.ts              (H6) → Tool #42
│   ├── list-tickets.ts               (H6) → Tool #43
│   ├── close-ticket.ts               (H6) → Tool #44
│   ├── send-nps-survey.ts            (H7) → Tool #45
│   ├── get-survey-results.ts         (H7) → Tool #46
│   ├── search-knowledge-base.ts      (H8) → Tool #47
│   └── create-kb-article.ts          (H8) → Tool #48
└── commands/
    ├── template.ts             (H2)
    ├── sequence.ts             (H1)
    ├── quote.ts                (H4)
    ├── ticket.ts               (H6)
    ├── survey.ts               (H7)
    └── kb.ts                   (H8)

src/commands/import.ts          → Erweiterung für H5 HubSpot CSV
src/commands/import-hubspot.ts  → neues Modul für H5
src/commands/server.ts          → Erweiterung: /quotes/:id, /survey/respond, /kb
src/daemon/worker.ts            → 2 neue CronJobs (sequences alle 6h, SLA täglich 8h)
src/mcp/server.ts               → 18 neue Tool-Registrierungen

__tests__/
├── sync/
│   ├── gmail-sender.test.ts    (Shared)
│   └── calendly.test.ts        (H3)
├── core/
│   ├── template-engine.test.ts (Shared)
│   ├── sequence-engine.test.ts (H1)
│   ├── quote-generator.test.ts (H4)
│   ├── sla-engine.test.ts      (H6)
│   └── survey-engine.test.ts   (H7)
├── fs/
│   ├── template-store.test.ts  (H2)
│   ├── sequence-store.test.ts  (H1)
│   ├── ticket-writer.test.ts   (H6)
│   └── knowledge-base.test.ts  (H8)
├── mcp/tools/
│   ├── draft-email.test.ts     (H2)
│   ├── enroll-in-sequence.test.ts  (H1)
│   └── create-ticket.test.ts   (H6)
└── commands/
    └── import-hubspot.test.ts  (H5)
```

---

## Test-Coverage-Ziel

| Modul | Tests | Coverage-Ziel |
|---|---|---|
| Shared Infra (gmail-sender, template-engine) | ~14 | 100% |
| H1 Sequences | ~21 | 100% |
| H2 Templates | ~18 | 100% |
| H3 Calendly | ~8 | 90% |
| H4 Quotes | ~10 | 95% |
| H5 HubSpot Import | ~12 | 90% |
| H6 Tickets | ~26 | 100% |
| H7 NPS/CSAT | ~10 | 95% |
| H8 Knowledge Base | ~16 | 90% |
| **Gesamt** | **~135 neue Tests** | |

**Gesamte Test-Suite nach diesem Plan: 1765 + ~135 = ~1900 Tests**

---

## Commit-Strategie

Jede Domäne = ein Commit, in dieser Reihenfolge:

```
feat(infra): gmail-sender + template-engine (shared, tests grün)
feat(h2): email templates vault — schema, fs, 3 MCP tools, CLI
feat(h1): email sequences engine — schema, fs, core, 4 MCP tools, CLI, daemon job
feat(h5): hubspot csv import — 4-csv handling, stage mapping, idempotency
feat(h4): quote & invoice generator — schema, core, 2 MCP tools, CLI
feat(h3): calendly integration — client, webhook handler, MCP tool
feat(h6): ticket management — schema, fs, sla-engine, 4 MCP tools, CLI, daemon job
feat(h7): nps/csat survey engine — schema, core, gmail send, 2 MCP tools, CLI
feat(h8): knowledge base — schema, fs, vector search, 2 MCP tools, CLI, kb serve
docs(update): README + docs/mcp-tools.md für alle 18 neuen Tools
```

**Vor jedem Commit:**
```
□ npm test        → Exit-Code 0
□ npm run build   → kein Fehler
□ npm run typecheck → kein Fehler
□ TOOL_COUNT in get-capabilities.ts aktualisiert
□ docs/mcp-tools.md aktualisiert
```

---

## Offene Abhängigkeiten / Neue npm-Packages

| Package | Wozu | Bereits vorhanden? |
|---|---|---|
| `googleapis` | Gmail Send (gmail-sender.ts) | Ja (`gmail-auth.ts` nutzt es) |
| `gray-matter` | Template-Frontmatter parsen | Ja |
| `zod` | Schemas | Ja |
| `express` | Server (quotes, surveys, kb) | Ja |
| `marked` | KB-Artikel Markdown → HTML | Vermutlich nicht — `npm install marked` |
| `pdf-lib` | PDF-Generation für Quotes | Nein — `npm install pdf-lib` (optional, Phase 2) |

**Kritisch:** `marked` für KB-Server. `pdf-lib` ist optional (Phase 2 Enhancement). Alles andere ist bereits vorhanden.

---

## Risiken & Mitigationen

| Risiko | Wahrscheinlichkeit | Mitigation |
|---|---|---|
| Gmail Send Rate Limits | Mittel | Rate-Limiter (existiert) + Exponential Backoff |
| Calendly API Änderungen | Niedrig | Abstraktion hinter Interface, einfach austauschbar |
| PDF-Generation zu komplex | Mittel | MVP: nur HTML, PDF als Enhancement mit pdf-lib |
| HubSpot CSV-Format ändert sich | Niedrig | Feldnamen-Erkennung via LLM-Mapping als Fallback |
| Survey-Response ohne Server | Mittel | Fallback: Reply-Parsing via Gmail Sync |

---

*Lead Developer Sign-off: Alle technischen Entscheidungen in diesem Dokument sind final. Implementierung startet mit 0.1 (Shared Infra).*
