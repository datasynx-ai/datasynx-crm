# DatasynxOpenCRM — Implementierungsplan v5 (konsolidiert)
**Brand:** Datasynx · **CLI:** `dxcrm` · **npm:** `datasynx-opencrm`
**Version:** 5.0 · **Status:** GO · **Datum:** 2026-06-05

> **Phasen 1–5 — ABGESCHLOSSEN** ✅ (Stand: 2026-06-05)
> 3207 Tests · Build sauber · Auf `main` gemergt · v1.9.0 publiziert
>
> **v5 konsolidiert** die vormals separaten Planungsdokumente in diese eine kanonische Spec.
> Integriert sind `Future-Feat.md` (Wettbewerbs-Feature-Tiefe, F1–F8 / C1–C8, siehe **Phase 5**)
> und `domino-plan.md` (Feature-Bau-Reihenfolge, D1–D17). Abgelöst (alle umgesetzt):
> `next-plan.md`, `v0-1-plan.md`, `plan-enterprise.md`, `plan-enterprise-npm.md`.

---

## Die strategische Wette

> **Die gesamte CRM-Branche basiert auf einer Annahme: Daten leben in einer Datenbank, die Menschen abfragen.**
> **Wir wetten, dass diese Annahme falsch ist — und dass KI-Agenten sie 2025 obsolet gemacht haben.**

Wenn ein KI-Agent Kundenhistorie in Echtzeit lesen, synthetisieren und darauf reagieren kann, braucht man keine Datenbank mit UI darüber. Man braucht strukturierte Dateien, eine Suchschicht und ein Protokoll, das Agenten mit Daten verbindet. Das ist DatasynxOpenCRM.

---

## Der eine Satz

> **Du öffnest kein CRM, um deinen Kunden zu finden.**
> **Der Agent deines Kunden findet dich — gebrieft, aktuell und bereit zu handeln.**

---

## Warum Jetzt

Drei Dinge konvergierten 2025:

- **MCP wurde zum Standard.** Anthropic lieferte MCP. OpenAI, Google DeepMind und Microsoft adoptierten es. Ein einziges Protokoll verbindet jeden KI-Agenten mit jedem Tool.
- **Lokale LLM-Infrastruktur reifte.** Embeddings laufen lokal via WASM/ONNX. LanceDB läuft eingebettet in Node.js. Kein externer Server nötig.
- **CRM-Fatigue ist auf dem Höchststand.** 74% der Enterprise-Käufer planen einen CRM-Wechsel zwischen 2025–2028 — weil sie $300/User/Monat für eine Datenbank zahlen, die ihre KI-Agenten nicht nativ nutzen können.

---

## Die vier unfairen Vorteile

**1. Local-first = GDPR-Moat**
Daten verlassen die Maschine des Users nie. Kein DPA. Kein Privacy-Impact-Assessment. Kein Right-to-Erasure-Workflow. Enterprise-Compliance-Teams werden das lieben. Cloud-CRMs können das strukturell nicht anbieten.

**2. Markdown ist die Muttersprache des LLM**
Jedes Cloud-CRM speichert Daten in einem proprietären Schema. Agenten müssen API-Responses parsen, Pagination handhaben, Rate-Limits managen. DatasynxOpenCRM speichert alles in Markdown — das LLM liest es direkt, ohne Zusatzkosten, ohne Latenz.

**3. Ein Agent pro Kunde ist für Cloud-CRMs architektonisch unmöglich**
Salesforce Agentforce ist ein Agent mit Zugriff auf alle Kundendaten. DatasynxOpenCRM ist N Agenten, jeder Spezialist für genau einen Kunden. Salesforce kann das nicht invertieren, ohne sein gesamtes Datenmodell neu zu bauen.

**4. Der `npm install`-Moat**
Jeder Enterprise-Softwarevendor erfordert Beschaffung, Rechtsüberprüfung, IT-Deployment und Training. DatasynxOpenCRM erfordert `npm install`. Entwickler installieren es in 30 Sekunden. Sie werden zu Champions, die Adoption nach oben treiben.

---

## Kill-Conditions

Wenn eine dieser Bedingungen eintritt, wird die Strategie — nicht das Produkt — gepivoted:

| Kill | Bedingung | Wahrscheinlichkeit | Hedge |
|---|---|---|---|
| KILL 1 | Ein großes Framework (Claude Code, Codex) stellt MCP-Support ein | Nahezu null — MCP ist jetzt branchenübergreifender Standard | MCP-Server gibt auch REST aus |
| KILL 2 | LanceDB versagt bei Scale (>10.000 Kunden, >1M Dokumente) | Niedrig — in Woche 2 benchmarken | Markdown-Dateien sind die Source of Truth, DB austauschbar |
| KILL 3 | Gut finanzierter Konkurrent liefert local-first + MCP-native + multi-framework vor 100 zahlenden Kunden | Mittel in 12 Monaten, niedrig in 6 Monaten | Open Source schafft Community-Moat |
| KILL 4 | Gmail / Google Calendar MCP-Endpunkte ändern sich oder werden eingeschränkt | Niedrig — Google hat sich zu MCP bekannt | Plugin-Architektur — Sync-Sources sind austauschbare Module |

---

## Die Domino-Sequenz — Vollständiger Pfad zu Enterprise

```
DOMINO 1: Der Core Loop (Wochen 1–4)
"Ein Solo-Entwickler führt dxcrm init aus und sein Agent kennt seine Kunden."
→ Entsperrt: echte Nutzungsdaten, erstes Feedback, das Flywheel startet

DOMINO 2: Das Flywheel (Wochen 5–8)
"Das CRM wird jeden Tag reicher, ohne dass der User irgendetwas tut."
→ Entsperrt: Switching Cost, Retention, Word-of-Mouth

DOMINO 3: Der Agent (Wochen 9–12)
"Jeder Kunde hat einen dedizierten Agenten, mit dem der User direkt spricht."
→ Entsperrt: das Produkt, das kein CRM kopieren kann

DOMINO 4: Das Team (Monate 4–6)
"Ein 3-Personen-Team teilt eine DatasynxOpenCRM-Instanz auf einer VM."
→ Entsperrt: wiederkehrender Umsatz, Multi-User-Architektur-Beweis

DOMINO 5: Die Migration (Monate 5–7)
"Ein Team migriert von HubSpot mit einem Befehl."
→ Entsperrt: Enterprise-Sales-Gespräche, Referenzkunden

DOMINO 6: Das Enterprise (Monate 7–12)
"Ein 50-Personen-Sales-Team betreibt DatasynxOpenCRM mit RBAC und Audit-Trail."
→ Entsperrt: Enterprise-Verträge, $100k+ ARR-Deals
```

---

## PHASE 1 — Der Core Loop
**Wochen 1–4 · Ziel: Solo-Entwickler / Freelancer**
**Kritischer Domino:** Ein echter User führt `dxcrm init` aus und sein Agent beantwortet "Was ist los mit Acme Corp?" korrekt — aus echten synced Daten — ohne manuellen Dateneintrag.

```
ERLEDIGT WENN:
Ein externer User (nicht das Team) nutzt dxcrm 7 aufeinanderfolgende Tage täglich,
ohne zu HubSpot zurückzukehren oder Kontext manuell in seinen Agenten einzufügen.
```

### Der 8-Glied-Kritische-Pfad

```
[1] init → [2] Source Discovery → [3] Customer Creation → [4] Gmail Sync
                                                                    ↓
[8] log_interaction ← [7] MCP Server ← [6] Context Builder ← [5] Transcript Watch
```

| Link | Feature | Status |
|---|---|---|
| 1 | `dxcrm init`: Framework-Erkennung + Harness-Generierung | ✅ |
| 2 | Source Discovery + Global Registry | ✅ |
| 3 | Customer Creation + Per-Customer Registry | ✅ |
| 4 | Gmail Sync Engine | ✅ |
| 5 | Transcript Watcher + Indexer | ✅ |
| 6 | Context Builder | ✅ |
| 7 | MCP Server (8 Tools) | ✅ |
| 8 | Write-Back: `log_interaction()` + `last_touchpoint` | ✅ |

---

### Link 1 — `dxcrm init`: Framework-Erkennung + Harness-Generierung ✅

Erkennt Claude Code, Codex, Hermes, OpenClaw via `which` + bekannte Config-Pfade.
Schreibt globale MCP-Configs automatisch. Führt Source Discovery durch. Startet Daemon.
**9 Framework-Adapter implementiert:** Claude Code, Codex, OpenClaw, Hermes, Antigravity, Cursor, Windsurf, Cline, Claude Desktop.

**Erledigt wenn:** `npx datasynx-opencrm init` wird auf einer sauberen Maschine in unter 60 Sekunden abgeschlossen, mit allen erkannten Frameworks, die DatasynxOpenCRM in ihrer globalen Config registrieren.

---

### Link 2 — Source Discovery + Global Registry ✅

Scannt `~/Downloads/Fireflies`, `~/Downloads/Otter`, `~/Documents/Zoom`.
Schreibt `.agentic/sources.json`. Fragt nie wieder.
> **Abweichung von Plan:** Kein Gmail-MCP-Test bei init (googleapis direkt, kein MCP-Wrapper).

**Erledigt wenn:** `.agentic/sources.json` wird korrekt ohne User-Input geschrieben.

---

### Link 3 — Customer Creation + Per-Customer Registry ✅

```bash
dxcrm create "Acme Corp" --domain acme.com --email max@acme.com
```

Erstellt `customers/acme-corp/` mit `main_facts.md`, `interactions.md`, `pipeline.md`, `sources.json`.
`sources.json` vorkonfiguriert mit der Gmail-Query `from:acme.com OR to:acme.com`.

**Erledigt wenn:** `dxcrm create` in unter 3 Sekunden, alle 4 Dateien korrekt geformt, `dxcrm validate` meldet null Schema-Fehler. ✅ Verifiziert.

---

### Link 4 — Gmail Sync Engine ✅

`dxcrm sync <slug>` + Daemon alle 30 Min (Plan sagte 15 Min — 30 Min gewählt wegen Gmail-Quota).
googleapis direkt → E-Mail-Header → `interactions.md`-Eintrag + LanceDB-Indexierung (Float32, mergeInsert).
Idempotent: sourceRef-Set, einmal vor der Schleife gelesen (O(1) pro Message).

> **Abweichung von Plan:** LLM-Extraktion noch nicht implementiert — Header (Subject/From/Date) + Snippet direkt übernommen. Vollständige LLM-Zusammenfassung ist Phase-2-Feature.

**Erledigt wenn:** `dxcrm sync acme-corp` bringt E-Mails in `interactions.md`, zweiter Sync = null Duplikate. ✅

---

### Link 5 — Transcript Watcher + Indexer ✅

`chokidar` v4 beobachtet Pfade in `.agentic/sources.json`. Neue `.txt`/`.vtt`-Datei → Embed → LanceDB → `interactions.md`.
> **Implementiert (Update):** LLM-Kundenerkennung ✅ — `processTranscriptFileAutoMatch()` nutzt `recognizeCustomer()` (Claude Haiku) und fällt bei fehlendem `ANTHROPIC_API_KEY`, niedriger Confidence oder unbekanntem Slug auf das Filename-/Content-Heuristik-Matching zurück (`src/sync/transcript-watcher.ts`).
> **Implementiert:** `.agentic/unmatched-transcripts.json` ✅ — `src/fs/unmatched-transcripts.ts` + `src/sync/transcript-watcher.ts`

**Erledigt wenn:** Transcript ablegen → binnen 5 Minuten in `interactions.md`. ✅

---

### Link 6 — Context Builder ✅

```typescript
buildContext(slug: string): Promise<string>
```

Liest `main_facts.md` + letzte 10 Interaktionen + Pipeline → LLM-fertiger Markdown-Block.
Token-Budget: bei >3000 Tokens auf 5 Interaktionen trimmen.

> **Abweichung von Plan:** Gibt `string` zurück, kein strukturiertes `ContextBlock`-Objekt. Für Phase 2 relevant wenn structured output in MCP-Response gebraucht wird.

**Erledigt wenn:** `buildContext("acme-corp")` deterministisch, <2s, <3000 Token. ✅

---

### Link 7 — MCP Server (8 Tools) ✅

```
stdio transport       → Claude Code, Codex, Hermes, Cursor, Cline, Windsurf
Streamable HTTP       → OpenClaw, Antigravity, Team-VM (port 3847)
```

> **Abweichung von Plan:** `instructions`-Feld in `McpServer()` existiert in v1.x nicht — Instructions in Tool-Descriptions eingebettet.

**MCP-Tools (implementiert):**

| Tool | Status |
|---|---|
| `get_capabilities()` | ✅ |
| `get_active_session()` | ✅ |
| `get_customer_context(slug?)` | ✅ (On-Query-Sync implementiert) |
| `search_customer_knowledge()` | ✅ (LanceDB + embedText) |
| `list_customers(filter?)` | ✅ (filtert nach Name, Slug, Stage) |
| `log_interaction()` | ✅ |
| `update_deal()` | ✅ |
| `export_customer()` | ✅ |

**Erledigt wenn:** `get_customer_context("acme-corp")` gibt ContextBlock in <3s zurück; `search_customer_knowledge` gibt LanceDB-Resultate zurück. ✅

---

### Link 8 — Write-Back: `log_interaction()` ✅

Eintrag erscheint in `interactions.md` binnen 1 Sekunde. Format identisch mit auto-synced Einträgen.
Sofort in LanceDB indexiert (non-blocking, try/catch).
> **Implementiert:** `last_touchpoint`-Update in `main_facts.md` ✅ — `src/mcp/tools/log-interaction.ts` Zeilen 65–79

**Erledigt wenn:** Agent ruft `log_interaction()` auf → Eintrag in `interactions.md` → nächster `get_customer_context()` enthält ihn. ✅

---

### Phase 1 — Schemas (Eingefroren nach Woche 1)

#### `main_facts.md` (Pflicht-Frontmatter: `id`, `status`, `owner`, `created`, `last_touchpoint`)

```markdown
---
id: acme-corp
status: active
owner: me
created: 2025-01-15
last_touchpoint: 2025-06-10
tags: [enterprise, saas]
---

# Customer: Acme Corp

## Quick Reference
- **Type:** GmbH · **Industry:** SaaS · **Size:** ~50 · **Website:** https://acme.com

## Contacts
| Name | Role | Email | Channel |
|---|---|---|---|
| Max Mustermann | CEO | max@acme.com | Slack |

## Summary
[2 Sätze: was sie tun, warum sie Kunde sind.]

## Critical Context
- Entscheider: Max. Lisa Schmidt (CTO) ist technischer Gatekeeper.
- Bevorzugt Slack. Keine Anrufe vor 10 Uhr. EU-Datenresidenz harte Anforderung.

## Open Questions
- [Dinge, die beim nächsten Kontakt geklärt werden müssen]
```

#### `interactions.md` — Eintragsformat (fest)

```markdown
## YYYY-MM-DD · [Typ] · [optional: Dauer oder Richtung]
**[Mit/Von/Betreff]:** [Wert]
**Zusammenfassung:** [2–5 Sätze]
**Nächste Schritte:**
- [ ] [Aktion]
**Quelle:** [gmail://thread/id oder Dateipfad]
**Synchronisiert:** [ISO-Zeitstempel]
---
```

#### `pipeline.md` — Deal-Format (fest)

```markdown
## [Deal-Name]
- **Stage:** [lead|qualified|discovery|proposal|negotiation|won|lost]
- **Value:** [Betrag + Währung]
- **Probability:** [0–100]%
- **Close:** YYYY-MM-DD
- **Health:** [🟢 active | ⚠️ stale (Nd) | 🔴 blocked]
```

**Stages sind gesperrt.** Keine Custom-Stages in V1. Enterprise erhält konfigurierbare Stages in Phase 4.

---

### Phase 1 — Sprint-Plan

#### Woche 1 — Foundation (Links 1, 2, 3) ✅ ABGESCHLOSSEN

- [x] Package-Scaffold: TypeScript 5.8, Commander v14, tsdown (statt tsup), ESM-only
- [x] ~~`postinstall.js`~~ → durch `dxcrm init` ersetzt (pnpm v10 blockiert postinstall)
- [x] `dxcrm init`: Discovery + `.agentic/sources.json` + Framework-Adapter + Daemon-Start
- [x] `dxcrm create`: Ordner + 4 Dateien + `sources.json` + Zod-Validierung
- [x] `dxcrm list` mit `--filter` (Name, Slug, Stage)
- [x] `dxcrm session open/close/status`
- [x] `dxcrm guide` + `dxcrm mcp docs`
- [x] `dxcrm validate` — alle Kunden gegen Schema prüfen
- [x] `dxcrm backup / restore`
- [x] `dxcrm daemon start/stop/status`
- [x] Templates: alle 4 Dateien im finalen Schema (main_facts, interactions, pipeline, sources)
- [x] 9 Framework-Adapter: Claude Code, Codex, OpenClaw, Hermes, Antigravity, Cursor, Windsurf, Cline, Claude Desktop

**Erledigt wenn:** `npx datasynx-opencrm init` + `create "Acme Corp"` + `validate` ✅ Verifiziert

#### Woche 2 — Data In (Links 4, 5) ✅ ABGESCHLOSSEN

- [x] LanceDB embedded, auto-Table pro Kunde (`docs_<slug>`), Float32-Schema
- [x] ~~`@xenova/transformers`~~ → `@huggingface/transformers` v3.8.1 (Xenova deprecated)
- [x] `all-MiniLM-L6-v2` Embedding-Pipeline, Promise-Singleton, `env.cacheDir` konfiguriert
- [x] `indexInLanceDB()`: embedText → mergeInsert("source_ref") → BTree-Index
- [x] `gmail-sync.ts`: googleapis direkt → Header/Snippet → `interactions.md` + LanceDB
- [x] `calendar-sync.ts`: Google Calendar → `interactions.md` + LanceDB
- [x] `gmail-auth.ts`: OAuth2-Flow für CLI
- [x] Domain-Matching: Gmail-Query aus `sources.json`
- [x] Idempotenz: sourceRef-Set, einmal gelesen (O(1) per Message)
- [x] `transcript-watcher.ts`: chokidar v4 Watch → Embed → LanceDB → `interactions.md`
- [x] Sync-Daemon: cron alle 30 Min (Plan: 15 Min — angepasst wegen Gmail-Quota)
- [x] `dxcrm backup schedule --every day --keep 7` — ✅ implementiert in `src/commands/backup.ts` (runBackupSchedule)
- [x] `.agentic/unmatched-transcripts.json` — ✅ implementiert in `src/fs/unmatched-transcripts.ts` + `src/sync/transcript-watcher.ts`

**Erledigt wenn:** Transcript ablegen → 5 Min → in `interactions.md`. Zweimal syncen → null Duplikate. ✅

#### Woche 3 — Agent Can Ask (Links 6, 7) ✅ ABGESCHLOSSEN

- [x] `context-builder.ts`: deterministisch, <3000 Token, Token-Budget-Trimming
- [x] MCP-Server: `server.registerTool()` (nicht `server.tool()` — deprecated)
- [x] stdio-Transport + Streamable HTTP-Transport (`dxcrm mcp start [--http] [--port]`)
- [x] Alle 8 MCP-Tools implementiert und getestet (36 Testdateien, 336 Tests)
- [x] On-Query-Sync-Trigger in `get_customer_context()` — ✅ implementiert in `src/mcp/tools/get-customer-context.ts`
- [x] `dxcrm mcp start` und `dxcrm mcp start --http`

**Erledigt wenn:** Agent fragt "Was ist los mit Acme Corp?" → korrekte Antwort <3s ✅

#### Woche 4 — Full Loop + Erster Kunde (Link 8 + Polish) ✅ ABGESCHLOSSEN

- [x] `log_interaction()`: Schreiben + LanceDB-Index (non-blocking)
- [x] `update_deal()`: `pipeline.md`-Upsert
- [x] `dxcrm backup / restore` (zip/unzip)
- [x] `dxcrm backup schedule --every day --keep 7` — ✅ implementiert
- [x] `export_customer()` MCP-Tool (JSON + Markdown Format)
- [x] Fehlerbehandlung: alle MCP-Tools geben strukturierte Fehler, werfen nie
- [x] `last_touchpoint` in `main_facts.md` via `log_interaction()` — ✅ implementiert in `src/mcp/tools/log-interaction.ts` (Zeilen 65–79)
- [x] README: 5-Minuten-Quickstart (Claude Code, Codex, Hermes)
- [x] docs/: cli-reference, mcp-tools, schemas, integrations, deployment
- [ ] Erster externer User ongeboardet — **nächster Schritt**

**Erledigt wenn:** Externer User führt 7 Tage lang den vollen Loop aus ohne HubSpot. ✅ Bereit zum Onboarding

---

### Phase 1 — Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@lancedb/lancedb": "^0.3.0",
    "@xenova/transformers": "^2.17.0",
    "commander": "^12.0.0",
    "gray-matter": "^4.0.3",
    "zod": "^3.22.0",
    "chokidar": "^3.6.0",
    "node-cron": "^3.0.3",
    "chalk": "^5.3.0",
    "cli-table3": "^0.6.3",
    "which": "^4.0.0"
  }
}
```

**SDK-Imports (korrekte Pfade — SSE ist deprecated, nicht verwenden):**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
```

---

### Phase 1 — Was Explizit Nicht Gebaut Wird

Jedes Item hat einen benannten Trigger. Ohne diesen Trigger wird es nicht gebaut.

| Feature | Trigger | Status |
|---|---|---|
| `dxcrm agent spawn` (per-customer agent) | Erster User fragt nach dediziertem Bot | ✅ in Phase 2 gebaut (`src/commands/agent.ts`) |
| HubSpot/Salesforce/Pipedrive/CSV Import | Erster User will migrieren | ✅ in Phase 2 gebaut (`src/commands/import.ts`) |
| Google Drive Sync | "Meine Proposals tauchen nicht auf" | Noch nicht gebaut |
| Cross-Customer Search MCP Tool | "Welche Kunden erwähnten Konkurrent X?" | Noch nicht gebaut |
| Multi-User / Team Sessions | Zweites Teammitglied will Zugriff | Noch nicht gebaut |
| Token Compression / Archivierung | User meldet Kontext zu groß | Noch nicht gebaut |
| Outlook / Teams Integration | Erster Windows-Enterprise-User | Noch nicht gebaut |
| Plugin-System | Stabiles V1 + 3 Community-Extension-Requests | Noch nicht gebaut |

---

## PHASE 2 — Das Flywheel
**Wochen 5–8 · Ziel: Aktive Solo-User, die es 14+ Tage genutzt haben**
**Kritischer Domino:** Das CRM wird jeden Tag reicher ohne jede User-Aktion.

```
ERLEDIGT WENN:
Ein User, der dxcrm 30 Tage genutzt hat, hat eine interactions.md
mit 40+ Einträgen — keinen hat er manuell geschrieben.
Sein Agent beantwortet Fragen, die sein früheres HubSpot nicht konnte.
```

### Domino 2a — On-Query Sync Zuverlässigkeit ✅ IMPLEMENTIERT (Stand 2026-06-02)
Daemon läuft 30 Tage ohne manuellen Neustart. Gmail-Sync behandelt Rate-Limits (max 50 Kunden pro Zyklus, Pagination, exponentieller Backoff). Nicht zuordenbare Transcripts akkumulieren in `.agentic/unmatched-transcripts.json` mit täglichem `dxcrm status`-Summary.

### Domino 2b — `dxcrm agent spawn` (Das Produkt-Differenzierungsmerkmal) ✅ IMPLEMENTIERT (Stand 2026-06-02)

```bash
dxcrm agent spawn acme-corp --channel telegram --wake-on-email
```

Schreibt `.agentic/agents/acme-corp.agent.json`. Verbindet mit OpenClaw oder Hermes.
Injiziert vollständige Context-Builder-Ausgabe als dauerhaftes System-Prompt.
Wake-Trigger: neue E-Mail von Kunden-Domain → Agent sendet Telegram-Nachricht mit Summary + vorgeschlagener Aktion.

**Erledigt wenn:** Max Mustermann sendet eine E-Mail → binnen 5 Minuten erhält der Owner eine Telegram-Nachricht vom Acme Corp Agent mit einem Antwort-Entwurf.

### Domino 2c — CRM Import (Der Migrationspfad) ✅ IMPLEMENTIERT (Stand 2026-06-02)

```bash
dxcrm import --from hubspot ./export/
dxcrm import --from salesforce ./salesforce-export.zip
dxcrm import --from pipedrive ./pipedrive-export/
dxcrm import --from csv ./my-customers.csv
```

LLM-gestütztes Feld-Mapping — kein manuelles Spalten-Matching.
Zwei-Pass-Import: Entities zuerst, dann relationale Links.
Jede Aktivität → ein korrekt formatierter `interactions.md`-Eintrag.

**Erledigt wenn:** Ein echter HubSpot-User importiert seine Daten und sein Agent beantwortet Fragen über seine Kundenhistorie aus der Zeit vor der DatasynxOpenCRM-Installation.

---

## PHASE 2 — Status (Stand 2026-06-02)

| Domino | Feature | Status |
|---|---|---|
| 2a | Gmail Pagination (maxPages=5) | ✅ implementiert in `src/sync/gmail-sync.ts` |
| 2a | Gmail exponential backoff retry | ✅ implementiert in `src/sync/gmail-sync.ts` |
| 2a | `.agentic/unmatched-transcripts.json` | ✅ implementiert in `src/fs/unmatched-transcripts.ts` + `src/sync/transcript-watcher.ts` |
| 2a | `dxcrm status --unmatched` | ✅ implementiert in `src/commands/status.ts` |
| 2a | On-Query-Sync-Trigger in `get_customer_context()` | ✅ implementiert in `src/mcp/tools/get-customer-context.ts` |
| 2a | `dxcrm backup schedule --every day --keep 7` | ✅ implementiert in `src/commands/backup.ts` |
| 2b | `dxcrm agent spawn / status / remove` | ✅ implementiert in `src/commands/agent.ts` |
| 2b | Telegram wake notification via `notifyAgentWake()` | ✅ implementiert in `src/core/agent-notifier.ts` |
| 2c | `dxcrm import --from hubspot` | ✅ implementiert in `src/commands/import.ts` + `src/commands/import-hubspot.ts` |
| 2c | `dxcrm import --from salesforce` | ✅ implementiert in `src/commands/import.ts` |
| 2c | `dxcrm import --from pipedrive` | ✅ implementiert in `src/commands/import.ts` |
| 2c | `dxcrm import --from csv` | ✅ implementiert in `src/commands/import.ts` |
| Bonus | RBAC (roles: admin/manager/rep, tool enforcement, customer visibility) | ✅ implementiert in `src/core/rbac.ts` |
| Bonus | Audit trail | ✅ implementiert in `src/fs/audit-log.ts` |
| Bonus | `last_touchpoint` in `main_facts.md` via `log_interaction()` | ✅ implementiert in `src/mcp/tools/log-interaction.ts` |

---

## PHASE 3 — Die Team-Schicht
**Monate 4–6 · Ziel: 3–10-Personen-Teams**
**Kritischer Domino:** Ein 3-Personen-Team teilt eine DatasynxOpenCRM-Instanz auf einer VM.

```
ERLEDIGT WENN:
Drei Personen bei einem Unternehmen öffnen jeweils ihren Agenten auf ihrem eigenen Laptop.
Alle drei Agenten rufen get_customer_context("acme-corp") auf und erhalten identische, aktuelle Daten.
Niemand musste manuell syncen oder mergen.
```

### Domino 3a — VM Deployment

```bash
# Ein Befehl auf der VM
dxcrm server start --http --port 3847 --data /mnt/crm-data

# Jedes Teammitglied fügt zu seiner Framework-Config hinzu:
# url: http://vm-ip:3847/mcp
```

Gemeinsame LanceDB. Gemeinsame Markdown-Dateien (gemountetes Volume). Alle Agenten verbinden via Streamable HTTP.

### Domino 3b — Session Ownership

```bash
dxcrm session open acme-corp --owner alice
```

Aktive Session sichtbar für alle Teammitglieder. Ein Owner pro Session (keine Kollision).
`dxcrm status` zeigt: wer welchen Kunden offen hat, letzter Touchpoint, offene Deal-Health.

### Domino 3c — Audit Trail ✅ BEREITS IMPLEMENTIERT (Stand 2026-06-02)

Jeder `log_interaction()`, `update_deal()` und `update_customer_facts()`-Aufruf schreibt einen zeitgestempelten, attributierten Eintrag in `.agentic/audit.log`.

Format: `2026-06-01T09:14:00Z | alice | log_interaction | acme-corp | Call summary...`

> **Status:** Implementiert in `src/fs/audit-log.ts`. Wird in `log_interaction()`, `update_deal()` und weiteren MCP-Tools ausgelöst.

---

## PHASE 4 — Enterprise
**Monate 7–12 · Ziel: 10–100-Personen-Sales-Teams**
**Kritischer Domino:** Ein 50-Personen-Sales-Team kann DatasynxOpenCRM adoptierten ohne Procurement-Gespräch, Security-Review-Scheitern oder Datenmigrations-Desaster.

```
ERLEDIGT WENN:
Ein Enterprise-Unternehmen (50+ User) betreibt DatasynxOpenCRM auf seiner Infrastruktur,
hat seinen internen Security-Review bestanden, alle Salesforce- oder HubSpot-Daten migriert
und einen Support-Vertrag mit Datasynx unterzeichnet.
```

### Domino 4a — RBAC (Role-Based Access Control) ✅ BEREITS IMPLEMENTIERT (Stand 2026-06-02)

```json
{
  "roles": {
    "rep": { "can_see": ["own_customers"], "can_write": ["interactions", "tasks"] },
    "manager": { "can_see": ["team_customers"], "can_write": ["pipeline", "deals"] },
    "admin": { "can_see": ["all"], "can_write": ["all"] }
  }
}
```

MCP-Server erzwingt Berechtigungen pro Tool-Aufruf. `get_customer_context()` respektiert Rolle.

> **Status:** Implementiert in `src/core/rbac.ts`. Roles: admin/manager/rep. Tool-Enforcement und Customer-Visibility aktiv.

### Domino 4b — Outlook / Teams Integration

`microsoft-sync.ts`: Microsoft Graph MCP → E-Mails + Kalenderevents → gleiche Pipeline wie Gmail.
Keine Code-Änderung an Context Builder oder MCP-Server nötig.

### Domino 4c — Enterprise Import (API-basiert)

```bash
dxcrm import --from salesforce --mode api --token $SFDC_TOKEN
```

Bewahrt die vollständige Historie inkl. verknüpfter Activities und Multi-Object-Beziehungen.

> **Status (Update):** Salesforce-API-Import deckt ab: Contacts → Kunden, Tasks → interactions,
> **Opportunities → `pipeline.md`-Deals** (Stage-Mapping SF→opencrm, Amount/Probability/CloseDate).
> **Volle Pagination** über `nextRecordsUrl` für Contacts, Tasks UND Opportunities via gemeinsamem
> `soqlQueryAll()`-Helper — kein LIMIT-Cap mehr, große Orgs werden vollständig importiert
> (`src/sync/salesforce-client.ts`, `runSalesforceApiImport` in `src/commands/import.ts`).
> **Leads** ✅ · **Events** ✅ · **Cases → Tickets** ✅ · **OpportunityLineItems → Quote** ✅ · **Notes** ✅ · **Campaigns (CampaignMember)** ✅.
> Damit deckt der Salesforce-API-Import alle Kern-Objekte ab. **Bewusst zurückgestellt** (niedriger ROI):
> Attachments (Binär-Download), API-Describe-Custom-Fields (im File-Import via LLM-Mapping abgedeckt),
> Owner→Actor & Account-Hierarchie.

### Domino 4d — Compliance-Paket

```
GDPR:    dxcrm gdpr erase <customer-slug>
         → Löscht alle Dateien, entfernt aus LanceDB, schreibt Löschprotokoll
         → Der Moat: Cloud-CRMs können EU-Datenresidenz nicht garantieren. Wir können.

SOC 2:   Keine Code-Änderung. Es ist ein Prozess-Audit.
         Das Audit-Trail aus Phase 3 ist das Beweispaket.
         Datasynx beantragt SOC 2 Type 2 nach 6 Monaten konsistenter Audit-Logs.

Security-Review:
         dxcrm security-report
         → Generiert ein Security-Fragebogen-Antwortdokument
         → Antworten: keine externe Datenübertragung, keine Cloud-Abhängigkeit,
           Verschlüsselung at rest via OS-Level-Disk-Verschlüsselung, Audit-Trail vollständig.
```

---

## PHASE 5 — Agenten-nativer Daten-, Memory- & Governance-Layer
**Ziel: Wettbewerbstiefe gegen etablierte CRMs (Salesforce/HubSpot/Zoho) und AI-natives (Attio/Day.ai/Clay)**

```
ERLEDIGT WENN:
Alle Pflicht-Module (F1–F8), Wettbewerbs-Features (C1–C8) und die
Feature-Domino-Sequenz (D1–D17) sind umgesetzt, getestet und auf main gemergt.
```

> **Status: ABGESCHLOSSEN ✅** — konsolidiert aus den vormals separaten Dokumenten
> `Future-Feat.md` (Feature-Tiefe) und `domino-plan.md` (Bau-Reihenfolge).
> Quelle der Anforderungen: `ResearchCRM.md` (Markt & Use-Cases 2026) + explizite Produktanforderungen.

### 5.0 Positionierung & Scope-Grenze (wichtigste Entscheidung)

**Wir bauen den Daten-, Kontext-, Memory-, Governance- und Observability-Layer für Agenten — nicht die
Agenten-Runtime.** Der Host (Claude Agent SDK / Mastra / Hermes) plant, denkt und führt aus; opencrm
liefert über MCP die *Tools, Resources, Prompts, Erinnerungen, SOPs, Leitplanken und Kostentransparenz*.

**NICHT in unser npm (das liefern die Frameworks):**
- Agent-Loop / Reasoning-Engine, Planning, Tool-Calling-Mechanik
- Voice/Realtime-Speech, Multimodalität
- LLM-Provider-Plumbing (Streaming, Retries, Modellwahl) — wir nutzen es nur (`callLlm`)
- Multi-Agent-*Ausführung* (wir liefern nur Routing/Handoff-Entscheidung + Audit)

**Sehr wohl unser Kern (der Moat):** local-first Daten, Markdown-SoT, Kontext-Builder, Memory, SOPs,
HITL/Approval, RBAC + Field-ACL, Audit, Backup, Vault, Token-Kosten je Kunde, Compliance.

**Markt-Realismus (ResearchCRM):** HITL + Datenqualität schlagen autonome Cold-Outbound-Bots
(50–70 % Tool-Churn p. a., >40 % agentic-Projekte abgebrochen). Wir setzen auf **verlässliche, messbare
HITL-Features mit Provenance** statt „robotischer Vollautonomie".

### 5.1 Pflicht-Module F1–F8 (alle umgesetzt)

| # | Modul | Status | Umsetzung |
|---|---|---|---|
| F1 | **Backup von allem** — verschlüsselt, verifizierbar, offsite | ✅ | `dxcrm backup` (ZIP, SHA-256, Schedule, Retention, S3/rsync-Upload, `verifyBackupFile`), AES-256-GCM (`encryption.ts`); Scope deckt `customers/` **und** `.agentic/` ab |
| F2 | **Tonalität je Kunde** (+ globales Default) | ✅ (D8) | Tone-Profil je Kunde, `resolveTone(slug)` mit Fallback auf global; automatisch in `draft_email`/Sequenzen angewandt |
| F3 | **Human-in-the-Loop + Approval** | ✅ (D4) | Generischer Approval-Layer + Autonomie-Policy (`auto`\|`approve`\|`block`) als MCP-Gate vor schreibenden Tools; `approve_agent_action`, Audit, RBAC |
| F4 | **Memories — je Kunde UND global** | ✅ (D6) | Typisierte Einträge (fact/preference/learning/instruction) mit Provenance; `remember`/`recall`; in `get_customer_context` injiziert |
| F5 | **SOP-Modul + Hybrid-Search** | ✅ (D7) | SOP-Store global + je Kunde, `find_sops({query, slug?})`, Resource `crm://sops`, im Prompt als Vorgehensanweisungen injiziert |
| F6 | **Lokaler Credential-Vault** | ✅ (D12) | `src/core/vault.ts` — AES-256-GCM-Blob `.agentic/vault.enc`, Master-Key nur via `DXCRM_VAULT_KEY`; CLI `dxcrm vault set\|get\|list\|rm`; von F1-Backup mitgesichert |
| F7 | **Token-Kosten je Kunde + Observability** | ✅ (D3) | Token-Ledger `.agentic/usage.ndjson` aus `callLlm`; Preis-Tabelle je Modell; `dxcrm usage [--slug] [--since]`, Resource `crm://usage` |
| F8 | **Hybrid-Search** (Vektor + Keyword + Rerank + Provenance) | ✅ (D2) | `hybridSearch(query, corpus)` — Fundament für F4/F5/KB/„Ask your CRM"; Chunking 128–512 Tokens, nur Geändertes neu einbetten |

### 5.2 Wettbewerbs-Features C1–C8 (HITL-first, alle umgesetzt)

| # | Feature | Status | Nutzen / Umsetzung |
|---|---|---|---|
| C1 | **Call/Meeting → CRM-Autofill** | ✅ (D9) | Transcript → {Kontakt, Next Steps, Stage, Objections} → Felder/Deal (mit Approval F3). Löst den #1-Schmerzpunkt manuelle Eingabe |
| C2 | **„Ask your CRM" (RAG-Chat / NL-Q&A)** | ✅ (D10) | NL-Fragen über strukturierte + unstrukturierte Daten via Hybrid-Search (F8) → MCP-Prompt + Resource |
| C3 | **Next-Best-Action-Engine** | ✅ (D11) | RAG über ähnliche gewonnene Deals + SOPs (F5) → empfohlener nächster Schritt |
| C4 | **Churn-Frühwarnung** | ✅ (D13) | `src/core/churn.ts` — invertierte relationship-health + Risk-Flags → `{riskScore, level, signals}`; `dxcrm churn assess\|scan` |
| C5 | **Daten-Hygiene-Agent** | ✅ (D5) | Fuzzy-Dedupe (Embeddings) + Format-/Lückenfix als Vorschläge mit Approval (F3) |
| C6 | **Enrichment-Layer** | ✅ (D15) | `src/core/enrichment.ts` — pluginbares `EnrichmentProvider`-Interface, füllt nur Lücken; Credentials aus D12-Vault; `dxcrm enrich <slug> [--write]` |
| C7 | **Conversation-Intelligence-Lite** | ✅ (D16) | `src/core/conversation-intel.ts` — Talk-Ratio, Discovery-Questions, Objection-Erkennung, Coaching-Tipps; `dxcrm coach <file>` |
| C8 | **Prädiktives Lead-Scoring (ML)** | ✅ (D14) | `src/core/lead-model.ts` — dependency-freie logistische Regression auf eigener won/lost-Historie; Fallback auf Heuristik; `dxcrm leadscore train\|predict` |

**Bewusst vermieden (ResearchCRM):** autonome **Cold-Outbound-SDR-Bots** als Kernfeature
(50–70 % Churn, Reputations-/Deliverability-Risiko). Inbound-Qualifizierung + Research/Daten-Layer sind
der verlässliche Pfad.

### 5.3 Feature-Domino-Sequenz D1–D17 (Bau-Reihenfolge — alle ✅)

> **Prinzip:** Jeder Stein ist so gewählt, dass er alle folgenden einfacher oder besser macht.
> Erst Fundamente & Multiplikatoren, dann Killer-Features, dann Tiefe & Härtung.
> *(Nicht zu verwechseln mit der strategischen Business-Domino-Sequenz DOMINO 1–6 weiter oben.)*

```
WELLE 0 (Fundament)        D1 ─▶ D2 ─▶ D3 ─▶ D4
                           backup  hybrid  usage  approval
WELLE 1 (Multiplikatoren)  D5 ─▶ D6 ─▶ D7 ─▶ D8
                           hygiene memories SOP  tonality
WELLE 2 (Killer-Features)  D9 ─▶ D10 ─▶ D11 ─▶ D12
                           autofill ask-crm NBA  vault
WELLE 3 (Tiefe + Härtung)  D13 ─▶ D14 ─▶ D15 ─▶ D16 ─▶ D17
                           churn  scoring enrich conv-intel compliance
```

**Welle 0 — Fundament** (macht alles Folgende sicher, messbar, steuerbar)
- **D1 ✅ Backup-all + Restore-Drill** (F1) — billiges Sicherheitsnetz; erfasst automatisch jeden später hinzukommenden Datentyp → fearless iteration für D2–D17.
- **D2 ✅ Hybrid-Search-Engine** (F8) — Retrieval-Grundlage; Prerequisite für D5, D6, D7, D10, D11.
- **D3 ✅ Token-Kosten/Observability am `callLlm`-Choke-Point** (F7) — jedes spätere LLM-Feature ist „born observable"; Basis für Outcome-Pricing.
- **D4 ✅ HITL-/Approval-Gate + Autonomie-Policy** (F3) — dünner Enforcement-Wrapper; spätere Automatisierung (D5, D9, D11, D12) dockt kostenlos an Freigaben an.

**Welle 1 — Multiplikatoren** (machen jede Interaktion klüger/konsistenter)
- **D5 ✅ Daten-Hygiene-Agent** (C5) — saubere Daten heben rückwirkend Scoring, Memories, Suche, NBA. Hängt ab von D2, D4.
- **D6 ✅ Memories je Kunde + global** (F4) — in `get_customer_context` injiziert. Hängt ab von D2.
- **D7 ✅ SOP-Modul + Trigger-Search** (F5) — prozedurales Wissen, per D2 auffindbar. Hängt ab von D2.
- **D8 ✅ Tonalität je Kunde** (F2) — dockt an `draft_email`/Sequenzen/Journeys an.

**Welle 2 — Killer-Features** (höchster Wert, jetzt entrisikt)
- **D9 ✅ Call/Meeting → CRM-Autofill** (C1) — nutzt D2/D3/D4/D6/D7. Hängt ab von D2, D3, D4, D6, D7.
- **D10 ✅ „Ask your CRM"** (C2) — hängt ab von D2 (+ D6, D7).
- **D11 ✅ Next-Best-Action-Engine** (C3) — hängt ab von D2, D6, D7, D4.
- **D12 ✅ Vault + GUI (Credentials)** (F6) — von D1-Backup mitverschlüsselt; schaltet D15 frei. GUI bleibt dokumentierter Follow-up, headless Core ist scriptbar.

**Welle 3 — Tiefe & Härtung** (Wettbewerbstiefe mit Governance)
- **D13 ✅ Churn-Frühwarnung** (C4) — hängt ab von D5 + relationship-health.
- **D14 ✅ Prädiktives ML-Lead-Scoring** (C8) — hängt ab von D5 + genügend Historie.
- **D15 ✅ Enrichment-Layer** (C6) — hängt ab von D12 (Vault für API-Keys).
- **D16 ✅ Conversation-Intelligence-Lite** (C7) — aus der D9-Transkript-Pipeline.
- **D17 ✅ Compliance-Härtung + lokale-LLM-Option** (§5.4) — Querschnitts-Härtung am Ende.

**Abhängigkeits-Kurzform:** D2→{D6,D7,D10,D11} · D4→{D5,D9,D11} · D5→{D13,D14} · D12→{D15} · D3→Pricing(alle).

### 5.4 Compliance (Pflicht für EU-Verkauf)

- **EU AI Act Art. 50 (ab 2. Aug. 2026):** KI-Inhalte als AI kennzeichnen ✅ — `src/core/compliance.ts`
  (`aiDisclosure`/`labelAiContent`, on-by-default, de/en, opt-out via `DXCRM_AI_DISCLOSURE=off`), in `draft_email` verdrahtet.
- **DSGVO:** ✅ `gdpr erase` (Files + LanceDB + Löschprotokoll); DPIA/FRIA-Doku in `docs/compliance.md`.
- **Datensouveränität als Verkaufsargument:** lokale LLM-Option ✅ — `callLlm` provider-agnostisch
  (Anthropic | lokal/Ollama via `DXCRM_LLM_PROVIDER/BASE_URL/MODEL`), Usage-Recording paritätisch.
- **Audit/Provenance:** ✅ Audit-Log + bi-temporaler Graph; `dxcrm compliance` als Posture-Read-out.

### 5.5 Architektur-Hinweise (Wiederverwendung)

- **Hybrid-Search (F8)** ist das gemeinsame Fundament für Memories, SOPs, KB, „Ask your CRM".
- **`callLlm`** ist der einzige LLM-Choke-Point → F7 (Usage-Ledger), PII-Masking + Guardrails sitzen hier; provider-agnostisch (lokale Modelle).
- **HITL-Gate (F3)** als dünner Wrapper vor schreibenden MCP-Tools (RBAC-ähnliches Enforcement).
- **Vault (F6)** nutzt `encryption.ts` + OS-Keychain; Vault-Key verschlüsselt auch F1-Backups.
- **Alles Neue persistiert unter `.agentic/`** (Markdown/JSON) → automatisch von F1-Backup erfasst.
- **Alles agenten-nativ exponieren:** je Modul ein MCP-Tool/Resource + CLI (Doppel-Oberfläche).

### 5.6 Risiken & Caveats (aus ResearchCRM)

- **Hype vs. Realität:** >40 % agentic-Projekte abgebrochen; Fokus auf messbare HITL-Quick-Wins statt Vollautonomie.
- **Outcome-Pricing braucht präzise Metrik-Definition** (was zählt als „resolved"/Outcome).
- **Build-vs-Buy:** Eigenbau lohnt nur durch das **local-first + Markdown + MCP-native + Governance**-Modell — unser Moat.
- **Vault/Lizenzen:** Lizenz gewählter npm (kdbxweb MIT / @napi-rs/keyring MIT) vor Auslieferung verifizieren; KeePassXC ist GPL (separate App, kein Linking).
- **EU-AI-Act-Fristen im Fluss** (Digital Omnibus): vor verbindlicher Umsetzung Rechtsstand prüfen.

---

## Dateistruktur (Kanonisch)

```
my-crm/
├── .agentic/
│   ├── config.json                   # Session-Zustand, Daemon-Status, Einstellungen
│   ├── sources.json                  # Globale Source-Registry (auto-geschrieben von init)
│   ├── schema.json                   # Validierungsregeln (auto-geschrieben von init)
│   ├── audit.log                     # Phase 3+: jeder Agent-Schreibvorgang, attributiert
│   ├── unmatched-transcripts.json
│   ├── lancedb/                      # Embedded DB — niemals manuell bearbeiten
│   └── agents/                       # Phase 2+: Agent-Configs
│       └── acme-corp.agent.json
│
└── customers/
    └── acme-corp/
        ├── main_facts.md             # Kerneintrag — validiertes Schema
        ├── interactions.md           # Auto-befüllt, neueste zuerst
        ├── pipeline.md               # Deals + Umsatz
        ├── sources.json              # Per-Kunde Source-Registry
        └── artifacts/                # PDFs, Verträge, Proposals
```

---

## Wettbewerbspositionierung

```
                    LOCAL-FIRST
                         ▲
              DatasynxOpenCRM ●
                         │
     CLOUD ──────────────┼──────────────── FILE SYSTEM
                   Twenty ●                (Owned data)
         HubSpot ●       │
     Salesforce ●  Attio ●│
                         │
                    AGENT-NATIVE
```

| | Salesforce | HubSpot | Twenty | Attio | **DatasynxOpenCRM** |
|---|---|---|---|---|---|
| **Local-first** | ✗ | ✗ | ✗ Docker | ✗ | **✓** |
| **Zero config** | ✗ | ✗ | ✗ | ✗ | **✓ npm install** |
| **MCP-native** | Bolt-on | Erstes großes CRM-MCP | OAuth-wrapped | Offizieller Server | **✓ Von Tag 1 gebaut** |
| **Per-customer agent** | ✗ | ✗ | ✗ | ✗ | **✓** |
| **Auto-sync** | Manuell | Gmail-Plugin | Manuell | Echtzeit-API | **✓ Background-Daemon** |
| **Human-readable** | ✗ | ✗ | ✗ | ✗ | **✓ Markdown** |
| **Multi-framework** | Nur Agentforce | Nur Breeze | REST/GraphQL | API | **✓ Jeder MCP-Client** |
| **Kosten** | $300+/User/Mo | $50+/User/Mo | Kostenlos (Docker) | $29+/User/Mo | **✓ $0** |
| **Datenportabilität** | Export (schmerzhaft) | Export (eingeschränkt) | Backup-Scripts | Eingeschränkt | **✓ ZIP = vollständiges Backup** |
| **GDPR-Moat** | Cloud, komplex | Cloud, komplex | Self-host | SaaS | **✓ Verlässt Maschine nie** |

---

## Ersetzungsvertrauen nach CRM

| Aktuelles CRM | Nach Phase 1 | Nach Phase 2 | Nach Phase 3 | Nach Phase 4 |
|---|---|---|---|---|
| Notion/Spreadsheet | **99%** | 99% | 99% | 99% |
| HubSpot Free/Starter | **90%** | 97% | 99% | 99% |
| Pipedrive Essentials | **80%** | 92% | 97% | 99% |
| HubSpot Professional | 30% | **75%** | 92% | 97% |
| Zoho Professional | 30% | 70% | 88% | 95% |
| Salesforce Enterprise | 5% | 20% | 50% | **80%** |

---

## Governance — Wie dieses Dokument aktuell bleibt

**Das PO-Prompt ist die Verfassung.**
Jedes neue Feature, jede Spec-Änderung, jede Roadmap-Anpassung wird bewertet, indem es durch das Domino-Framework und den Validierungsmodus in `DatasynxOpenCRM_PO_Prompt.md` geführt wird.

**Versions-Disziplin:**
- V5 = kanonische Spec (dieses Dokument) — konsolidiert Future-Feat + domino-plan
- V4 = vorherige kanonische Spec (Phasen 1–4)
- PO-Prompt = das Governance-System, das die Spec produziert hat

**Die Spec ändert sich, wenn:**
1. Ein echter User auf eine Lücke stößt, die nicht im Backlog ist → zum Backlog hinzufügen mit Trigger
2. Ein Domino fällt → Phase als "abgeschlossen" markieren + nächste Phase entsperren
3. Eine Kill-Condition ausgelöst wird → Strategie-Session, neue Version

**Die Spec ändert sich nicht, wenn:**
- Jemand eine gute Idee hat → Ideen gehen mit Trigger ins Backlog, nicht in die Spec
- Ein Konkurrent ein Feature liefert → wir evaluieren via PO-Prompt, nicht reaktiv
- Das Team sich für eine Technologie begeistert → Begeisterung ist kein Trigger

---

## Die drei Dinge, die das unvermeidlich machen

**1. Das Modell wird besser, das Produkt wird besser — automatisch.**
Jede Verbesserung von Claude, GPT oder einem anderen LLM macht DatasynxOpenCRMs Agenten ohne Code-Änderung fähiger. Cloud-CRMs müssen Features bauen, um neue LLM-Fähigkeiten zu nutzen. DatasynxOpenCRM erbt sie per Design.

**2. Local-first ist die GDPR-Antwort, auf die Enterprise-Unternehmen gewartet haben.**
Jedes Enterprise-Rechtsteam weiß, dass GDPR-Compliance mit Cloud-CRMs ein gemanagtes Risiko ist, kein eliminiertes. DatasynxOpenCRM eliminiert es. Die Daten verlassen das Gebäude nie.

**3. Der Entwickler installiert es in 30 Sekunden bei seinem aktuellen Unternehmen.**
Dann wechselt er zu einem neuen Unternehmen und installiert es am ersten Tag. Dann empfiehlt er es seinem Team. Dann fordert sein Team es beim nächsten Unternehmen. Das ist das Flywheel, das Salesforce mit seinem 6-Monats-Beschaffungszyklus nicht stoppen kann.

---

*DatasynxOpenCRM v5 — Kein CRM. Eine Flotte von Agenten.*
*Gebaut von Datasynx. Open Source. Zero Lock-in. `npm install`.*

*Der Domino, der zuerst fallen muss:*
*Ein echter User öffnet HubSpot nie wieder.*
