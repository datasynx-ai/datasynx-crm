# DatasynxOpenCRM — Phase 2 Kickoff-Guide
**Titel:** Das Flywheel · **Wochen 5–8**
**Erstellt:** 2026-05-26 · **Basis:** Phase 1 vollständig abgeschlossen ✅

> Dieses Dokument ist kein Spec (das bleibt `plan.md`). Es ist der technische Wissenstransfer
> aus Phase 1 — was gelernt wurde, was uns überraschte, und was Phase 2 wirklich braucht.

---

## 1 — Was Phase 1 wirklich geliefert hat

### Zahlen (Stand 2026-05-26)

| Metrik | Wert |
|---|---|
| Tests | 336 (alle grün) |
| Test-Dateien | 36 |
| MCP-Tools | 8 |
| Framework-Adapter | 9 |
| CLI-Commands | 12 (init, create, list, validate, session, guide, sync, backup, restore, daemon, mcp start, mcp docs) |
| Build-Output | ESM-only (kein CJS) |
| Embedding-Modell | `all-MiniLM-L6-v2` — 384-dim Float32, ~25 MB |
| LanceDB-Schema | Float32-Vector + source_ref BTree-Index, mergeInsert-Upsert |
| Daemon-Interval | 30 Min (nicht 15 wie geplant — Gmail-Quota) |

---

## 2 — Abweichungen vom ursprünglichen Plan (Nicht rückgängig machen)

Diese Entscheidungen wurden unter Realitätsdruck getroffen. Sie gelten als stabilisiert.

| Geplant | Implementiert | Grund |
|---|---|---|
| `postinstall.js` | `dxcrm init` (expliziter Befehl) | pnpm v10 blockiert postinstall-Skripte in Security-Modus |
| `tsup` | `tsdown` (Rolldown-basiert) | tsdown ist der offizielle Nachfolger, schneller, ESM-nativer |
| `chalk` | `ansis` | Leichter, ESM-first, kein globaler State |
| `@xenova/transformers` | `@huggingface/transformers` v3.8.1 | @xenova ist deprecated, HuggingFace ist der offizielle Nachfolger |
| `format: ["esm", "cjs"]` | `format: ["esm"]` | Top-level `await` in `cli.ts` und `daemon/worker.ts` inkompatibel mit CJS |
| 15-Min-Daemon | 30-Min-Daemon | Gmail Daily Quota — 250 Units/Tag reichen für ~8 Sync-Zyklen mit 30 Min |
| `instructions` in McpServer() | Instructions in Tool-Descriptions | MCP SDK v1.x hat kein `instructions`-Feld im Konstruktor |
| `server.tool()` | `server.registerTool()` | `server.tool()` ist deprecated ab MCP SDK v1.0 |
| LLM-basierte E-Mail-Extraktion | Header + Snippet direkt | Noch offen für Phase 2 |
| LLM-Kundenerkennung in Transcripts | Default-Kunde (erster in `customers/`) | Noch offen für Phase 2 |
| `ContextBlock`-Objekt | `string` (Markdown) | Ausreichend für Phase 1 — strukturiertes Output in Phase 2 optional |

---

## 3 — Technische Gotchas (Phase 2 wird sie wiedersehen)

### 3.1 MCP SDK v1.x — Was NICHT existiert

```typescript
// FALSCH — existiert nicht in v1.x:
new McpServer({ instructions: "..." })
server.tool("name", schema, handler)  // deprecated

// KORREKT:
new McpServer({ name: "...", version: "..." })
server.registerTool("name", { title, description, inputSchema }, handler)
```

### 3.2 gray-matter: NIEMALS `matter.read()` in Tests verwenden

`matter.read(path)` liest die Datei direkt mit dem echten `fs` — bypassed memfs vollständig.

```typescript
// FALSCH (in getesteten Funktionen):
const raw = matter.read(filePath);

// KORREKT:
const content = fs.readFileSync(filePath, "utf-8");
const raw = matter(content);
```

### 3.3 LanceDB v0.29+ — Korrekte API

```typescript
// Import:
import * as lancedb from "@lancedb/lancedb";
import { Index, makeArrowTable } from "@lancedb/lancedb";
import { Schema, Field, FixedSizeList, Float32 as ArrowFloat32, Utf8 } from "apache-arrow";

// Upsert-Pattern:
await table
  .mergeInsert("source_ref")
  .whenMatchedUpdateAll()
  .whenNotMatchedInsertAll()
  .execute(data);

// BTree-Index (für scalar fields):
await table.createIndex("source_ref", { config: Index.btree() });

// Kein ANN-Index auf Textfeldern — nur auf vector-Spalte automatisch
```

### 3.4 @huggingface/transformers v3.8.1 — Singleton-Pattern

```typescript
import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";

env.cacheDir = path.join(homedir(), ".cache", "datasynx-opencrm", "models");

class EmbeddingPipeline {
  private static instance: Promise<FeatureExtractionPipeline> | null = null;
  static get(): Promise<FeatureExtractionPipeline> {
    if (!this.instance) {
      // process.stdout.write("Loading embedding model (first time, ~25MB)...\n");
      this.instance = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2") as Promise<...>;
    }
    return this.instance;
  }
  static reset(): void { this.instance = null; }
}
```

**Wichtig:** In Tests `resetEmbeddingPipeline()` in `beforeEach` aufrufen UND `vi.clearAllMocks()` — in dieser Reihenfolge.

### 3.5 chokidar v4 — Keine Glob-Strings

```typescript
// FALSCH (chokidar v4 ignoriert Glob in ignored):
ignored: "**/*.mp3"

// KORREKT:
ignored: (p: string, stats?: fs.Stats) => {
  if (stats?.isDirectory()) return false;
  return !extensions.some((ext) => p.endsWith(ext));
}
```

### 3.6 StreamableHTTPServerTransport — TypeScript-Kompatibilität

```typescript
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

// sessionIdGenerator: undefined ist FALSCH mit exactOptionalPropertyTypes
// → Property einfach weglassen:
const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });

// Transport-Type-Inkompatibilität:
await server.connect(transport as unknown as Transport);
```

### 3.7 Vitest + dynamische Imports — Mock-Propagation

Wenn eine Source-Datei einen dynamischen `await import("../andere/datei.js")` macht, und
`andere/datei.js` wiederum npm-Packages importiert, kann der `vi.mock("npm-package")` aus
`setup.ts` in dieser Kette NICHT zuverlässig angewendet werden.

**Symptom:** Test timeout weil das echte Modell geladen wird (~1.2s), unter Last >5s.

**Lösung:** Das lokale Modul direkt mocken im Test:
```typescript
vi.mock("../../src/core/lancedb.js", () => ({
  indexInLanceDB: vi.fn().mockResolvedValue(undefined),
  searchKnowledge: vi.fn().mockResolvedValue([]),
  resetConnection: vi.fn(),
}));
```

**Regel:** Lokale Module mit dynamischen Imports → immer direkt mocken, nicht nur Abhängigkeiten.

### 3.8 cron — 5-stelliges Pattern

```typescript
// FALSCH (6-stellig = Sekunden — node-cron versteht es, verhält sich aber anders):
new CronJob("*/15 * * * * *", callback)

// KORREKT (5-stellig = Minuten):
new CronJob("*/30 * * * *", callback)
```

### 3.9 Daemon-Spawn — Process detachment

```typescript
// FALSCH — parent-Process bleibt offen:
spawn("node", [workerPath], { detached: true });

// KORREKT:
const child = spawn("node", [workerPath], {
  detached: true,
  stdio: "ignore",  // kritisch
});
child.unref();      // kritisch
```

### 3.10 exactOptionalPropertyTypes — TypeScript strict

Mit `exactOptionalPropertyTypes: true` (aktiviert in tsconfig) ist folgendes FALSCH:
```typescript
// FALSCH:
{ sessionIdGenerator: undefined }

// KORREKT — Property weglassen:
{}
// oder conditional spread:
{ ...(value !== undefined ? { key: value } : {}) }
```

---

## 4 — Offene Punkte aus Phase 1 (In Phase 2 umsetzen)

### Priorität 1 — Kritisch für Flywheel

| Feature | Datei | Beschreibung |
|---|---|---|
| `last_touchpoint` Update | `src/mcp/tools/log-interaction.ts` | Nach `appendInteraction()` → `last_touchpoint: date` in `main_facts.md` Frontmatter schreiben |
| On-Query-Sync | `src/mcp/tools/get-customer-context.ts` | Wenn letzter Sync >30 Min: `syncGmail()` nicht-blockierend triggern bevor Context zurückgegeben wird |
| LLM-E-Mail-Zusammenfassung | `src/sync/gmail-sync.ts` | Statt Header+Snippet → LLM (claude-haiku) für 2-Satz-Summary |
| LLM-Kundenerkennung | `src/sync/transcript-watcher.ts` | Transcript → LLM → Customer-Slug (statt Default-Kunde) |

### Priorität 2 — Stabilität

| Feature | Beschreibung |
|---|---|
| `.agentic/unmatched-transcripts.json` | Nicht erkannte Transcripts sammeln, `dxcrm status` daily summary |
| Daemon-Robustheit | Gmail Rate-Limit-Backoff (exponentiell), max 50 Kunden pro Zyklus, Auto-Restart via PID-Check |
| `dxcrm backup schedule --every day --keep 7` | Cron-Job im Daemon + Rolling-Delete |

### Priorität 3 — Phase 2 Core

| Feature | Beschreibung |
|---|---|
| `dxcrm agent spawn acme-corp --channel telegram --wake-on-email` | Per-Customer Agent Config + Wake-Trigger |
| `dxcrm import --from hubspot ./export/` | LLM-gestütztes Feld-Mapping |

---

## 5 — Phase 2 Architektur-Entscheidungen (Jetzt treffen, nicht später)

### 5.1 `last_touchpoint` schreiben ohne YAML-Corruption

Das Frontmatter in `main_facts.md` wird von `gray-matter` gelesen. Um es zu schreiben, MUSS man
`matter.stringify(content, data)` verwenden — NICHT manuell in den String eingreifen.

```typescript
import matter from "gray-matter";
import fs from "fs";

async function updateLastTouchpoint(mainFactsPath: string, date: string): Promise<void> {
  const raw = matter(fs.readFileSync(mainFactsPath, "utf-8"));
  raw.data.last_touchpoint = date;
  fs.writeFileSync(mainFactsPath, matter.stringify(raw.content, raw.data), "utf-8");
}
```

### 5.2 On-Query-Sync — Non-blocking Pattern

```typescript
// In get_customer_context tool:
const lastSync = getLastSyncTimestamp(slug);
const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

if (!lastSync || lastSync < thirtyMinAgo) {
  // Fire-and-forget: nicht awaiten
  syncGmail({ slug, dataDir, auth, query }).catch(() => {});
}

// Dann Context bauen und sofort zurückgeben
return buildContext(slug);
```

### 5.3 LLM-Integration — Welches Modell, welche API

Für Phase 2-LLM-Features: **claude-haiku-4-5** via Anthropic SDK.

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // liest ANTHROPIC_API_KEY aus env

const summary = await client.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 200,
  messages: [{
    role: "user",
    content: `Email Subject: ${subject}\nSnippet: ${snippet}\n\nSchreibe eine 2-Satz-Zusammenfassung auf Deutsch.`
  }]
});
```

**Fallback:** Wenn kein API-Key → Header+Snippet direkt (Phase 1-Verhalten).

### 5.4 Agent Spawn — Architektur-Entscheidung

`dxcrm agent spawn acme-corp --channel telegram` schreibt:
```json
// .agentic/agents/acme-corp.agent.json
{
  "slug": "acme-corp",
  "channel": "telegram",
  "wakeOn": ["email"],
  "systemPrompt": "[wird von get_customer_context() befüllt]",
  "lastWake": null
}
```

Der Daemon (30-Min-Zyklus) prüft für jeden Agenten: neue E-Mail seit `lastWake`?
→ Ja: Anthropic API aufrufen mit aktuellem Context → Telegram-Nachricht senden.

**Dependencies für Phase 2:**
- `@anthropic-ai/sdk` — LLM-Calls
- `node-telegram-bot-api` — Telegram-Integration (nur wenn User telegraml channel wählt)

### 5.5 Import-Command — Zwei-Pass-Architektur

```
Pass 1: Entities anlegen
  HubSpot-CSV → LLM-Feld-Mapping → dxcrm create für jeden Kontakt

Pass 2: Aktivitäten importieren  
  HubSpot-Activities → LLM → interactions.md-Einträge (ohne Duplikat-IDs)
```

Das LLM-Mapping braucht einen festen Prompt-Template pro CRM-Typ (HubSpot, Salesforce, CSV).
Kein generisches Mapping — zu fehleranfällig.

---

## 6 — Phase 2 Sprint-Plan (Wochen 5–8)

### Woche 5 — Flywheel-Stabilisierung (Offene Phase-1-Items)

- [ ] `last_touchpoint` in `main_facts.md` via `log_interaction()` — gray-matter stringify
- [ ] On-Query-Sync in `get_customer_context()` — non-blocking fire-and-forget
- [ ] `.agentic/unmatched-transcripts.json` — Transcript-Queue + `dxcrm status` integration
- [ ] Daemon Rate-Limit-Handling — exponentieller Backoff, max 50 Kunden/Zyklus
- [ ] `dxcrm backup schedule --every day --keep 7`
- [ ] Tests für alle obigen (TDD: Test zuerst)

**Erledigt wenn:** Daemon läuft 7 Tage ohne manuellen Neustart. `dxcrm status` zeigt echten Zustand.

### Woche 6 — LLM-Integration

- [ ] Anthropic SDK einbinden (`@anthropic-ai/sdk`)
- [ ] Gmail-Sync: LLM-Summary (claude-haiku) statt raw Snippet
- [ ] Transcript-Watcher: LLM-Kundenerkennung (Slug-Matching via Kundennamen in Transcript)
- [ ] Fallback wenn kein ANTHROPIC_API_KEY: Phase-1-Verhalten
- [ ] Tests: LLM-Calls mocken (`vi.mock("@anthropic-ai/sdk")`)

**Erledigt wenn:** `dxcrm sync acme-corp` → interactions.md enthält 2-Satz-Zusammenfassung statt raw Snippet.

### Woche 7 — `dxcrm agent spawn`

- [ ] Agent-Config-Schema (`AgentConfig` Zod-Schema)
- [ ] `dxcrm agent spawn <slug> --channel telegram --wake-on-email`
- [ ] Daemon: Wake-Trigger-Check pro Agent-Config
- [ ] Telegram-Integration (als optionale Dependency — nur wenn Channel = telegram)
- [ ] `dxcrm agent status` — zeigt alle aktiven Agenten

**Erledigt wenn:** E-Mail von acme.com → binnen 5 Min Telegram-Nachricht mit Antwort-Entwurf.

### Woche 8 — CRM Import + Phase 2 Complete

- [ ] `dxcrm import --from hubspot ./export/` — zwei Passes, LLM-Feld-Mapping
- [ ] `dxcrm import --from csv ./customers.csv`
- [ ] Dry-Run-Modus: `--dry-run` zeigt was importiert würde
- [ ] Erster externer User migriert von HubSpot
- [ ] README und docs/ für alle Phase-2-Features aktualisiert

**Erledigt wenn:** Ein echter HubSpot-User führt `dxcrm import` aus und sein Agent beantwortet Fragen über Pre-DatasynxOpenCRM-Historie.

---

## 7 — Nicht bauen in Phase 2 (Trigger fehlt)

| Feature | Trigger |
|---|---|
| Google Drive Sync | "Meine Proposals tauchen nicht auf" |
| Cross-Customer Search | "Welche Kunden erwähnten Konkurrent X?" |
| Multi-User / Team | Zweites Teammitglied will Zugriff |
| Token Compression | User meldet Kontext zu groß |
| Outlook / Teams | Erster Windows-Enterprise-User |
| Windsurf/Cline-spezifische Features | Community-Requests nach 50+ Installationen |
| Plugin-System | Stabiles V1 + 3 Community-Extension-Requests |

---

## 8 — Kritischer Pfad Phase 2

```
[A] last_touchpoint Fix
         ↓
[B] On-Query-Sync
         ↓
[C] LLM-Summary (Gmail + Transcript)
         ↓
[D] dxcrm agent spawn (Wake-Trigger)
         ↓
[E] CRM Import (Migrationspfad)
         ↓
[F] Externer User migriert von HubSpot
```

Jede Stufe entsperrt die nächste. `[F]` = Flywheel läuft.

---

## 9 — Definitions of Done für Phase 2

```
ERLEDIGT WENN:
Ein User, der dxcrm 30 Tage genutzt hat, hat eine interactions.md
mit 40+ Einträgen — keinen hat er manuell geschrieben.
Sein Agent beantwortet Fragen, die sein früheres HubSpot nicht konnte.
```

Konkret messbar:
- `dxcrm status` zeigt >40 Interaktionen ohne manuellen Eintrag
- `search_customer_knowledge("Was war das letzte Meeting?")` gibt korrektes Datum + Summary
- `dxcrm agent spawn` → Telegram-Nachricht geht raus binnen 5 Min nach E-Mail-Eingang

---

*DatasynxOpenCRM Phase 2 — Das Flywheel dreht sich.*
*Kein täglicher HubSpot-Login mehr. Kein manuelles CRM-Update.*
*Der Agent weiß es bereits.*
