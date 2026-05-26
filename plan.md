# DatasynxOpenCRM — Implementierungsplan v4
**Brand:** Datasynx · **CLI:** `dxcrm` · **npm:** `datasynx-opencrm`
**Version:** 4.0 · **Status:** GO · **Datum:** 2026-05-24

> **Phase 1 — ABGESCHLOSSEN** ✅ (Stand: 2026-05-26)
> 336 Tests · Build sauber · Auf `main` gemergt · Bereit für ersten externen User

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
> **Abweichung von Plan:** LLM-Kundenerkennung noch nicht implementiert — Transcripts werden dem Default-Kunden (ersten in `customers/`) zugeordnet. Korrekte Zuordnung kommt in Phase 2.
> **Missing:** `.agentic/unmatched-transcripts.json` noch nicht implementiert.

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
| `get_customer_context(slug?)` | ✅ (On-Query-Sync noch offen — Phase 2) |
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
> **Missing:** `last_touchpoint`-Update in `main_facts.md` noch nicht implementiert — kommt in Phase 2.

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
- [ ] `dxcrm backup schedule --every day --keep 7` — **offen für Phase 2**
- [ ] `.agentic/unmatched-transcripts.json` — **offen für Phase 2**

**Erledigt wenn:** Transcript ablegen → 5 Min → in `interactions.md`. Zweimal syncen → null Duplikate. ✅

#### Woche 3 — Agent Can Ask (Links 6, 7) ✅ ABGESCHLOSSEN

- [x] `context-builder.ts`: deterministisch, <3000 Token, Token-Budget-Trimming
- [x] MCP-Server: `server.registerTool()` (nicht `server.tool()` — deprecated)
- [x] stdio-Transport + Streamable HTTP-Transport (`dxcrm mcp start [--http] [--port]`)
- [x] Alle 8 MCP-Tools implementiert und getestet (36 Testdateien, 336 Tests)
- [ ] On-Query-Sync-Trigger in `get_customer_context()` — **offen für Phase 2**
- [x] `dxcrm mcp start` und `dxcrm mcp start --http`

**Erledigt wenn:** Agent fragt "Was ist los mit Acme Corp?" → korrekte Antwort <3s ✅

#### Woche 4 — Full Loop + Erster Kunde (Link 8 + Polish) 🔄 WEITGEHEND ABGESCHLOSSEN

- [x] `log_interaction()`: Schreiben + LanceDB-Index (non-blocking)
- [x] `update_deal()`: `pipeline.md`-Upsert
- [x] `dxcrm backup / restore` (zip/unzip)
- [ ] `dxcrm backup schedule --every day --keep 7` — **offen**
- [x] `export_customer()` MCP-Tool (JSON + Markdown Format)
- [x] Fehlerbehandlung: alle MCP-Tools geben strukturierte Fehler, werfen nie
- [ ] `last_touchpoint` in `main_facts.md` via `log_interaction()` — **offen**
- [x] README: 5-Minuten-Quickstart (Claude Code, Codex, Hermes)
- [x] docs/: cli-reference, mcp-tools, schemas, integrations, deployment
- [ ] Erster externer User ongeboardet — **nächster Schritt**

**Erledigt wenn:** Externer User führt 7 Tage lang den vollen Loop aus ohne HubSpot. 🔄 Bereit zum Onboarding

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

| Feature | Trigger |
|---|---|
| `dxcrm agent spawn` (per-customer agent) | Erster User fragt nach dediziertem Bot |
| HubSpot/Salesforce Import | Erster User will migrieren |
| Google Drive Sync | "Meine Proposals tauchen nicht auf" |
| Cross-Customer Search MCP Tool | "Welche Kunden erwähnten Konkurrent X?" |
| Multi-User / Team Sessions | Zweites Teammitglied will Zugriff |
| Token Compression / Archivierung | User meldet Kontext zu groß |
| Outlook / Teams Integration | Erster Windows-Enterprise-User |
| Plugin-System | Stabiles V1 + 3 Community-Extension-Requests |

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

### Domino 2a — On-Query Sync Zuverlässigkeit
Daemon läuft 30 Tage ohne manuellen Neustart. Gmail-Sync behandelt Rate-Limits (max 50 Kunden pro Zyklus, Pagination, exponentieller Backoff). Nicht zuordenbare Transcripts akkumulieren in `.agentic/unmatched-transcripts.json` mit täglichem `dxcrm status`-Summary.

### Domino 2b — `dxcrm agent spawn` (Das Produkt-Differenzierungsmerkmal)

```bash
dxcrm agent spawn acme-corp --channel telegram --wake-on-email
```

Schreibt `.agentic/agents/acme-corp.agent.json`. Verbindet mit OpenClaw oder Hermes.
Injiziert vollständige Context-Builder-Ausgabe als dauerhaftes System-Prompt.
Wake-Trigger: neue E-Mail von Kunden-Domain → Agent sendet Telegram-Nachricht mit Summary + vorgeschlagener Aktion.

**Erledigt wenn:** Max Mustermann sendet eine E-Mail → binnen 5 Minuten erhält der Owner eine Telegram-Nachricht vom Acme Corp Agent mit einem Antwort-Entwurf.

### Domino 2c — CRM Import (Der Migrationspfad)

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

### Domino 3c — Audit Trail

Jeder `log_interaction()`, `update_deal()` und `update_customer_facts()`-Aufruf schreibt einen zeitgestempelten, attributierten Eintrag in `.agentic/audit.log`.

Format: `2026-06-01T09:14:00Z | alice | log_interaction | acme-corp | Call summary...`

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

### Domino 4a — RBAC (Role-Based Access Control)

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

### Domino 4b — Outlook / Teams Integration

`microsoft-sync.ts`: Microsoft Graph MCP → E-Mails + Kalenderevents → gleiche Pipeline wie Gmail.
Keine Code-Änderung an Context Builder oder MCP-Server nötig.

### Domino 4c — Enterprise Import (API-basiert)

```bash
dxcrm import --from salesforce --mode api --token $SFDC_TOKEN
```

Bewahrt die vollständige Historie inkl. verknüpfter Activities und Multi-Object-Beziehungen.

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
- V4 = kanonische Spec (dieses Dokument)
- V3 = Implementierungsreferenz (Details zu Schemas, Codex-Config, Migrations-Interna)
- PO-Prompt = das Governance-System, das V4 produziert hat

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

*DatasynxOpenCRM v4 — Kein CRM. Eine Flotte von Agenten.*
*Gebaut von Datasynx. Open Source. Zero Lock-in. `npm install`.*

*Der Domino, der zuerst fallen muss:*
*Ein echter User öffnet HubSpot nie wieder.*
