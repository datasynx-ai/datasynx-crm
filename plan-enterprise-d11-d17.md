# Plan: Enterprise-Optimierung D11–D17

> Basis: Technische Tiefenanalyse aller D11–D17 Implementierungen · Stand: 2026-05-28
> Ziel: Production-Grade, Enterprise-ready, Observable, Resilient
> Methode: TDD-first, inkrementell, keine Breaking Changes in MCP-Schnittstellen

---

## Executive Summary

D11–D17 sind **funktional korrekt** für Solo-Developer-Nutzung. Für Enterprise-Einsatz
(Teams, >100 Kunden, externe Provider-Integrationen) fehlen 4 Ebenen:

1. **Datensicherheit**: Mehrere Race Conditions bei concurrent Writes (D11, D15, D16, D17)
2. **Resilienz**: Kein Retry-/Circuit-Breaker-Pattern bei LLM, Webhooks, Disk I/O (D13, D14, D17)
3. **Observability**: Zero structured logging, keine Metriken, keine Health-Checks
4. **Input-Validierung**: Business-Logic akzeptiert invalide Daten ohne Rejection (D13, D14, D16)

Ohne diese Fixes: Datenverlust bei parallelem Zugriff, Produktionsausfälle bei API-Downtime,
keine Diagnose-Fähigkeit.

---

## Priorisierung

### P0 — Production-Blocking (blockt jede Beta/GA-Einführung)

| ID | Gap | Betroffene Dominos |
|---|---|---|
| P0-1 | Race Conditions auf JSON-Files (concurrent read-write ohne Lock) | D11, D15, D16, D17 |
| P0-2 | Kein Retry + kein Circuit-Breaker bei LLM-Calls | D13, D16 |
| P0-3 | Webhook-Handler: verarbeitete Events increments `eventsProcessed` auch bei Fehler | D17 |
| P0-4 | Gmail-Push: Duplikate bei gleichzeitigen Events (historyId race) | D17 |
| P0-5 | Action double-execution: ApproveAgentAction ohne atomares Compare-and-Swap | D13 |
| P0-6 | Unbegrenzte Memory-Allokation in Revenue-Simulation (iterations ohne Cap) | D14 |
| P0-7 | Goal-Deadline nicht validiert → Crash bei invalid ISO 8601 | D16 |

### P1 — Enterprise-Blocking (blockt Team-Nutzung / Compliance / Scale)

| ID | Gap | Betroffene Dominos |
|---|---|---|
| P1-1 | Kein Structured Logging in Core-Schicht | D11–D17 |
| P1-2 | Kein Health-Check / Readiness Endpoint | D17 (Server) |
| P1-3 | N+1 File-Reads in ObserveDeal() | D11, D12, D13 |
| P1-4 | Contact Matching ohne Email-Normalisierung (Duplikate) | D12, D17 |
| P1-5 | Interaction-Datum in Webhooks = today() statt tatsächlichem Timestamp | D17 |
| P1-6 | Kein graceful Degradation wenn Playbook-Service unavailable | D13 |
| P1-7 | Subscription: kein `permanently_failed` State, retry forever | D17 |
| P1-8 | No-rate-limit on Webhook Renewal (1000 sequential API calls) | D17 |
| P1-9 | Audit Trail für Agent-Action-Escalation (Act-Mode ohne Approver-Log) | D13 |
| P1-10 | Playbook: SUCCESS_RATE nie auto-updated nach Ergebnis | D15 |
| P1-11 | Input-Size-Limits: LLM-Response ohne max-Bytes-Rejection | D13, D15, D16 |

### P2 — Polish (macht das Produkt professional, aber nicht breaking)

| ID | Gap | Betroffene Dominos |
|---|---|---|
| P2-1 | Goal Progress auto-update wenn Deal gewonnen | D16 |
| P2-2 | Stale Graph Nodes: keine Pruning-Strategie | D11 |
| P2-3 | Playbook Trigger OR-Logik fehlt | D15 |
| P2-4 | Revenue Simulation: winning-only byCloseMonth (aktuell alle Iterationen) | D14 |
| P2-5 | Relationship Health: DST-sichere Datumsberechnung | D12 |
| P2-6 | Cross-Provider Email-Dedup (Gmail + Microsoft gleiches Mail) | D17 |
| P2-7 | `days_stalled` im Playbook-DSL = Relationship-Stall, nicht Stage-Change | D15 |

---

## Neue Shared-Infrastruktur (Implementierung vor Domino-Fixes)

Alle P0/P1-Fixes bauen auf 4 neuen shared Modulen auf:

### Modul 1: `src/core/file-lock.ts`
Atomares Write-Pattern für alle JSON-Files. Nutzt write-queue.ts intern.

```typescript
// Löst: P0-1, P0-5
export async function withJsonFile<T>(
  filePath: string,
  fn: (current: T | null) => T
): Promise<T>
// Liest → transformiert → schreibt atomar via write-queue.ts
// Kein separater Lock-File: Promise-Queue per Dateipfad
```

### Modul 2: `src/core/resilience.ts`
Retry + Circuit Breaker + Timeout als DI-freundliche Higher-Order Functions.

```typescript
// Löst: P0-2, P0-6
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts: number; backoffMs: number; shouldRetry?: (err: Error) => boolean }
): Promise<T>

export class CircuitBreaker {
  constructor(opts: { threshold: number; timeout: number; halfOpenAfter: number })
  async call<T>(fn: () => Promise<T>): Promise<T>
}
```

### Modul 3: `src/core/structured-log.ts`
Structured JSON-Logging via stderr (MCP-sicheres Output-Kanal).

```typescript
// Löst: P1-1
export type LogLevel = "debug" | "info" | "warn" | "error";
export interface LogEntry {
  level: LogLevel; ts: string; domain: string; msg: string;
  durationMs?: number; slug?: string; toolName?: string;
  errorKind?: string; [key: string]: unknown;
}
export function log(domain: string, entry: Omit<LogEntry, "ts" | "domain">): void
export function withTimer(domain: string, msg: string, slug?: string): () => void
```

### Modul 4: `src/core/input-guard.ts`
Bounds-Checks und Sanitization für Business-Logic-Boundaries.

```typescript
// Löst: P1-11, P0-7, P0-6
export function guardString(val: unknown, field: string, opts?: { maxLen?: number; pattern?: RegExp }): string
export function guardNumber(val: unknown, field: string, opts?: { min?: number; max?: number }): number
export function guardIsoDate(val: unknown, field: string): string // throws auf ungültige Dates
export function guardLlmResponse(response: string, maxBytes?: number): string
```

---

## Implementierungs-Sequenz

### Phase A — Shared Infrastructure (Basis für alle Fixes)

```
A1: src/core/file-lock.ts + __tests__/core/file-lock.test.ts        (~15 Tests)
A2: src/core/resilience.ts + __tests__/core/resilience.test.ts       (~20 Tests)
A3: src/core/structured-log.ts + __tests__/core/structured-log.test.ts (~10 Tests)
A4: src/core/input-guard.ts + __tests__/core/input-guard.test.ts      (~15 Tests)
```

**Commit:** `infra: shared file-lock, resilience, structured-log, input-guard`

---

### Phase B — P0 Fixes (Production-Blocking)

**B1: D11/D15/D16 — Concurrent Write Safety**

Geänderte Dateien:
- `src/core/graph.ts` → `writeGraph()` nutzt `withJsonFile()`
- `src/core/playbooks.ts` → `writePlaybook()` / `upsertPlaybook()` nutzt `withJsonFile()`
- `src/core/goal-engine.ts` → `writeGoals()` nutzt `withJsonFile()`

Vor:
```typescript
// graph.ts:96-101
export function writeGraph(dataDir: string, slug: string, graph: CustomerGraph): void {
  fs.mkdirSync(path.dirname(graphPath), { recursive: true });
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), "utf-8");
}
```

Nach:
```typescript
export async function writeGraph(dataDir: string, slug: string, updater: (current: CustomerGraph | null) => CustomerGraph): Promise<CustomerGraph> {
  return withJsonFile<CustomerGraph>(graphPath(dataDir, slug), updater);
}
```

*Note: Signature ändert sich von sync → async mit updater-Funktion. Alle Caller werden mitgeändert.*

---

**B2: D13 — Agent Action Double-Execution**

Geänderte Datei: `src/mcp/tools/approve-agent-action.ts`

Lösung: Optimistic Concurrency via `version` field in agent-queue.json.

```typescript
interface AgentAction {
  id: string;
  version: number;       // NEU: inkrementiert bei jedem Update
  status: "pending" | "approved" | "rejected" | "executed";
  // ...
}

// Approve-Handler prüft version vor Update:
export async function handleApproveAgentAction(input: {...}, dataDir: string): Promise<...> {
  return withJsonFile<AgentQueue>(queuePath, (queue) => {
    const action = queue.pendingActions.find(a => a.id === input.actionId);
    if (!action) throw new Error(`Action ${input.actionId} not found`);
    if (action.version !== input.expectedVersion) throw new Error("Concurrent modification — refresh and retry");
    return { ...queue, pendingActions: queue.pendingActions.map(a =>
      a.id === input.actionId ? { ...a, status: "approved", version: a.version + 1 } : a
    )};
  });
}
```

---

**B3: D14 — Memory Cap für Revenue Simulation**

Geänderte Datei: `src/core/revenue-simulation.ts`

```typescript
const MAX_ITERATIONS = 50_000;
const DEFAULT_ITERATIONS = 10_000;

export function runSimulation(input: SimulationInput): SimulationResult {
  const iterations = Math.min(input.iterations ?? DEFAULT_ITERATIONS, MAX_ITERATIONS);
  // byMonthOutcomes: statt Array<number[]>, nutze laufende Summen
  const byMonthSums: Record<string, { sum: number; count: number }> = {};
  // → O(iterations × deals) Memory statt O(iterations × months)
}
```

---

**B4: D16 — Deadline-Validation**

Geänderte Datei: `src/core/goal-engine.ts`

```typescript
import { guardIsoDate } from "./input-guard.js";

export async function pursueGoal(dataDir: string, input: { description: string; deadline: string; context?: string }, options: ...): Promise<Goal> {
  const deadline = guardIsoDate(input.deadline, "deadline"); // throws if invalid
  // ...
}
```

---

**B5: D17 — Webhook Event-Counter / Sync-State Fix**

Geänderte Datei: `src/sync/gmail-webhook-handler.ts`

Sync-State und eventsProcessed werden nur bei tatsächlich erfolgreichen Interactions geschrieben:

```typescript
// Vor: updateSlugSyncState immer aufgerufen
// Nach: nur wenn processed > 0
if (processed > 0) {
  updateSlugSyncState(dataDir, slug, { lastGmailPushHistoryId: payload.historyId });
  // eventsProcessed increment
}
```

---

**Commit nach Phase B:** `fix(P0): concurrent write safety, action dedup, memory caps, input validation`

---

### Phase C — P1 Fixes (Enterprise-Blocking)

**C1: Structured Logging Integration**

Alle Core-Module erhalten `log()` Calls an key decision points:

```typescript
// graph.ts — Beispiel
export async function writeGraph(...): Promise<CustomerGraph> {
  const done = withTimer("graph", "upsert", slug);
  try {
    const result = await withJsonFile(...);
    done(); // logs { level: "info", domain: "graph", msg: "upsert", durationMs: 12, slug }
    return result;
  } catch (err) {
    log("graph", { level: "error", msg: "write_failed", slug, errorKind: (err as Error).message });
    throw err;
  }
}
```

Domains: `graph`, `health`, `agent`, `simulation`, `playbook`, `goal`, `push`, `webhook`

---

**C2: LLM Circuit Breaker**

Geänderte Dateien: `src/core/deal-agent.ts`, `src/core/goal-engine.ts`, `src/core/playbooks.ts`

```typescript
// src/core/llm-circuit.ts
import { CircuitBreaker } from "./resilience.js";

const llmBreaker = new CircuitBreaker({ threshold: 5, timeout: 30_000, halfOpenAfter: 60_000 });

export async function callLlmSafe(prompt: string, llmFn: (p: string) => Promise<string>): Promise<string | null> {
  try {
    return await llmBreaker.call(() => llmFn(prompt));
  } catch (err) {
    log("llm", { level: "warn", msg: "circuit_open", errorKind: (err as Error).message });
    return null; // Caller nutzt rule-based fallback
  }
}
```

Alle LLM-Caller nutzen `callLlmSafe()` → wenn Circuit offen, rule-based Fallback immer aktiv.

---

**C3: Health-Check Endpoint**

Geänderte Datei: `src/mcp/server.ts`

```typescript
app.get("/health", async (_req, res) => {
  const checks: Record<string, "ok" | "degraded" | "down"> = {
    filesystem: "ok",
    pushSubscriptions: "ok",
  };

  try { fs.accessSync(process.cwd(), fs.constants.R_OK | fs.constants.W_OK); }
  catch { checks["filesystem"] = "down"; }

  const { readSubscriptions } = await import("../sync/push-manager.js");
  const subs = await readSubscriptions(dataDir).catch(() => null);
  if (subs === null) checks["pushSubscriptions"] = "degraded";

  const allOk = Object.values(checks).every((s) => s === "ok");
  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    version: "0.1.0",
    checks,
    ts: new Date().toISOString(),
  });
});

app.get("/ready", (_req, res) => {
  res.status(200).json({ ready: true });
});
```

---

**C4: Email Normalization für Contact-Dedup**

Neue Datei: `src/core/email-normalizer.ts`

```typescript
export function normalizeEmail(raw: string): string {
  // "John Doe <john@example.com>" → "john@example.com"
  const match = raw.match(/<([^>]+@[^>]+)>/);
  return (match?.[1] ?? raw).toLowerCase().trim();
}

export function normalizeContactId(raw: string): string {
  return normalizeEmail(raw);
}
```

Geänderte Dateien: `src/core/relationship-health.ts` (groupInteractionsByContact), `src/sync/gmail-webhook-handler.ts`

---

**C5: Interaction Timestamp aus Provider-Daten**

Geänderte Dateien:
- `src/sync/gmail-webhook-handler.ts` → nutzt `full.date` (RFC 2822) statt `new Date().toISOString()`
- `src/sync/microsoft-webhook-handler.ts` → nutzt `message.receivedDateTime`

```typescript
// gmail-webhook-handler.ts:99 — VOR:
date: new Date().toISOString().slice(0, 10),

// NACH:
date: full.date
  ? new Date(full.date).toISOString().slice(0, 10)
  : new Date().toISOString().slice(0, 10),
```

---

**C6: Subscription permanently_failed + Rate-Limited Renewal**

Geänderte Datei: `src/sync/push-manager.ts`

```typescript
export type PushStatus = "active" | "expired" | "revoked" | "error" | "permanently_failed";

// renewExpiringSubscriptions — parallel mit concurrency limit
export async function renewExpiringSubscriptions(
  dataDir: string,
  renewFn: RenewFn,
  thresholdHours = 24,
  opts: { maxRetries?: number; concurrency?: number } = {}
): Promise<{ renewed: string[]; errors: string[] }> {
  const { maxRetries = 3, concurrency = 5 } = opts;
  // Batched renewal: max 5 concurrent API calls
  // Nach maxRetries Fehlern: status → "permanently_failed"
}
```

---

**C7: Agent Audit Trail für Act-Mode**

Geänderte Datei: `src/core/deal-agent.ts`

```typescript
// Vor auto-execution in "act" mode:
if (action.confidence >= AUTONOMY_THRESHOLDS.act) {
  await logAuditEvent(dataDir, {
    action: "agent_auto_execute",
    tool: action.type,
    actor: "system:deal-agent",
    slug,
    dealName,
    confidence: action.confidence,
    autonomyLevel: input.autonomyLevel,
  });
  // then execute
}
```

---

**C8: LLM-Response Size Limits**

Geänderte Dateien: `src/core/deal-agent.ts`, `src/core/playbooks.ts`, `src/core/goal-engine.ts`

```typescript
import { guardLlmResponse } from "./input-guard.js";

const response = guardLlmResponse(rawResponse, 512_000); // max 512KB
```

---

**Commit nach Phase C:** `feat(P1): structured-log, circuit-breaker, health-check, email-dedup, audit-trail`

---

### Phase D — P2 Polish

**D1: Goal Progress Auto-Update**

Neue Funktion `syncGoalProgressFromPipeline(dataDir)` in `goal-engine.ts`:
- Liest alle aktiven Goals
- Liest Pipeline aller relevanten Customers
- Berechnet % bereits gewonnener Deals gegenüber Target
- Wird in Daemon-CronJob (`*/30 * * * *`) integriert

**D2: Playbook Trigger OR-Logic**

DSL-Erweiterung in `parseTrigger()`:

```
EXISTING: "deal_stage_negotiation AND value > 50000"
NEW:      "champion_present OR economic_buyer_present"
NEW:      "(champion_present OR economic_buyer_present) AND value > 10000"
```

Implementierung: Tokenizer-Erweiterung, kein Breaking Change bei bestehenden Playbooks.

**D3: Revenue Simulation — Winning-Only byCloseMonth**

```typescript
// Aktuell: byMonthOutcomes enthält alle Iterationen
// Neu: nur wenn deal in dieser Iteration "wins" (bernoulli draw success)
if (winRoll < adjustedProbability) {
  byMonthSums[closeMonthKey] ??= { sum: 0, count: 0 };
  byMonthSums[closeMonthKey].sum += dealValue;
  byMonthSums[closeMonthKey].count++;
}
```

**D4: Graph Node Pruning**

Neue Funktion `pruneStaleNodes(graph, maxAgeDays = 365)`:
- Nodes mit `lastSeen < now - maxAgeDays` werden zu `status: "inactive"` (nicht gelöscht)
- `get_relationship_graph` filtert `inactive` Nodes aus Standard-Response
- Opt-in: `{ includeInactive: true }` zeigt alle

**D5: Playbook Success Rate Feedback Loop**

`distill_playbook` setzt `successRate` basierend auf `outcome`:
- `won` → successRate = 0.75 (Baseline)
- `lost` → successRate = 0.25
- `updateGoalProgress` bei 100% → triggert `updatePlaybookSuccessRate` für verwendete Playbooks

---

## Test-Matrix

| Phase | Neue Tests | Fokus |
|---|---|---|
| A (Infra) | ~60 | file-lock race conditions, circuit breaker states, log format, input-guard edge cases |
| B (P0) | ~40 | concurrent write atomicity, memory limits, action dedup, date validation |
| C (P1) | ~50 | health-check responses, email normalization, audit log entries, LLM size rejection |
| D (P2) | ~30 | OR-trigger parsing, graph pruning, winning-only distribution |
| **Total neu** | **~180** | |
| **Gesamt** | **~1481** | |

---

## Betroffene Dateien (Gesamtliste)

### Neue Dateien
```
src/core/file-lock.ts
src/core/resilience.ts
src/core/structured-log.ts
src/core/input-guard.ts
src/core/email-normalizer.ts
src/core/llm-circuit.ts

__tests__/core/file-lock.test.ts
__tests__/core/resilience.test.ts
__tests__/core/structured-log.test.ts
__tests__/core/input-guard.test.ts
__tests__/core/email-normalizer.test.ts
```

### Geänderte Dateien
```
src/core/graph.ts                          ← writeGraph async + withJsonFile + log
src/core/graph-extractor.ts               ← email validation + log
src/core/relationship-health.ts           ← email normalization + DST-safe dates + log
src/core/deal-agent.ts                    ← callLlmSafe + audit trail + LLM size limit + log
src/core/revenue-simulation.ts            ← memory cap + winning-only distribution + log
src/core/playbooks.ts                     ← withJsonFile + OR-trigger + size limit + log
src/core/goal-engine.ts                   ← withJsonFile + guardIsoDate + callLlmSafe + log
src/sync/push-manager.ts                  ← permanently_failed + batched renewal + log
src/sync/gmail-webhook-handler.ts         ← sync-state conditional + real timestamp + log
src/sync/microsoft-webhook-handler.ts     ← real timestamp + log
src/sync/slack-webhook-handler.ts         ← ts validation + log
src/mcp/tools/approve-agent-action.ts     ← optimistic concurrency
src/mcp/server.ts                         ← /health enriched + /ready
src/daemon/worker.ts                      ← syncGoalProgressFromPipeline cron
```

---

## Breaking Changes & Migration

**Keine Breaking Changes in MCP-Tool-Schemas.**

Interne Änderungen:
1. `writeGraph()` wird async → alle internen Caller werden geändert
2. `writeGoals()` / `writePlaybook()` werden async → alle Caller geändert
3. `callLlm()` wrapped in Circuit Breaker → non-breaking, gleiche Signatur

---

## Abgrenzung: Was hier NICHT gemacht wird

- **Keine Datenbank**: bleibt Markdown/JSON-first
- **Keine horizontale Skalierung**: kein Redis/distributed lock — Datei-Locks reichen für Einzel-Server
- **Keine Metriken-Infrastruktur (Prometheus/Grafana)**: structured JSON logs sind der erste Schritt
- **Keine OAuth-Token-Rotation**: bleibt in bestehender gmail-auth.ts
- **D18–D20 Features**: nicht Teil dieses Plans

---

## Commit-Strategie

```
Phase A: infra: file-lock, resilience, structured-log, input-guard
Phase B: fix(P0): concurrent writes, memory caps, input validation, action dedup
Phase C: feat(P1): circuit-breaker, health-check, email-dedup, audit-trail, timestamps
Phase D: polish(P2): goal-progress-sync, OR-triggers, graph-pruning, winning-distribution
Merge:   enterprise: D11-D17 production-ready (main)
```

---

## Zeitschätzung

| Phase | Komplexität | Tests | Geschätzte Implementierungszeit |
|---|---|---|---|
| A — Shared Infra | mittel | 60 | 1 Session |
| B — P0 Fixes | hoch | 40 | 1 Session |
| C — P1 Fixes | hoch | 50 | 1–2 Sessions |
| D — P2 Polish | niedrig | 30 | 1 Session |
| **Gesamt** | | **180** | **4–5 Sessions** |
