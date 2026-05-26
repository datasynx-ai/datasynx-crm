# Final-Plan.md — DatasynxOpenCRM
# Vollständige Implementierungsanalyse + offene Punkte
# Stand: 2026-05-26

---

## EXECUTIVE SUMMARY

| Phase | Domino | Status | Bemerkung |
|---|---|---|---|
| Phase 1 | Core Loop | ✅ VOLLSTÄNDIG | 9 MCP-Tools, 9 Framework-Adapter, Daemon, Schemas |
| Phase 2 | Flywheel | ✅ VOLLSTÄNDIG | Daemon-Stabilität, On-Query-Sync, Agent-Wake-Trigger, Import |
| Phase 3 | Team-Schicht | ✅ VOLLSTÄNDIG | VM-Deployment, Session Ownership, Audit Trail |
| Phase 4 | Enterprise | ⚠️ PARTIAL | RBAC-Enforcement und GDPR-LanceDB fehlen |
| Phase 5 | Migration | ✅ VOLLSTÄNDIG | Pipedrive, Salesforce API, LLM-Feldmapping |

**Test-Stand:** 551 Tests, 59 Dateien, alle grün  
**Kritische Lücken:** 4 (zwei davon sicherheitsrelevant)

---

## TEIL 1: WAS IST IMPLEMENTIERT

### Phase 1 — Core Loop ✅

#### `dxcrm init` + Framework-Erkennung
- 9 Framework-Adapter: Claude Code, Codex, OpenClaw, Hermes, Antigravity, Cursor, Windsurf, Cline, Claude Desktop
- Auto-Discovery: `~/Downloads/Fireflies`, `~/Downloads/Otter`, `~/Documents/Zoom`
- `.agentic/sources.json` + `config.json` werden angelegt
- `--team <url>` für HTTP-Server-Onboarding
- Harness-Dateien: `CLAUDE.md`, `AGENTS.md`, `SOUL.md`, `.cursor/rules/`, `.mcp.json` etc.

#### Schemas (eingefroren nach Woche 1)
- `main_facts.md` — Zod-Validierung: name, domain, email, phone, industry, relationship_stage, deal_value, primary_contact, timezone, tags, created, updated
- `interactions.md` — Format: date, type, direction, with, summary, nextSteps, sourceRef, synced
- `pipeline.md` — Deals mit stage (7 Werte), value, probability, close_date, health
- `sources.json` — Gmail-Query + Transcript-Pfade pro Kunde

#### Gmail-Sync-Engine
- `src/sync/gmail-sync.ts` — Google API direkt, LLM-Zusammenfassung via `summarizeEmail()`
- OAuth2-Flow: `src/sync/gmail-auth.ts`
- Idempotenz: sourceRef `gmail://message/<id>` verhindert Duplikate
- Rate-Limit-Handling: Retry + Pagination

#### Transcript-Watcher
- `src/sync/transcript-watcher.ts` — chokidar v4, `awaitWriteFinish`
- LLM-Kundenerkennung: `recognizeCustomer()` in `src/core/llm.ts`
- Ungematchte Transcripts: `.agentic/unmatched-transcripts.json`

#### Context Builder
- `src/core/context-builder.ts` — deterministisch, <3000 Tokens
- Sections: Quick Reference, Contacts, Critical Context, Recent Activity (10 Einträge), Pipeline, Open Questions
- Token-Budget-Trimming (Fallback auf 5 Einträge bei Überschreitung)

#### MCP-Server — 9 Tools
| Tool | Datei | Besonderheit |
|---|---|---|
| `get_capabilities` | `get-capabilities.ts` | Vollständige Agenten-Dokumentation |
| `get_customer_context` | `get-customer-context.ts` | On-Query-Sync (30-min-Schwellwert) |
| `search_customer_knowledge` | `search-customer-knowledge.ts` | LanceDB Hybrid-Suche |
| `list_customers` | `list-customers.ts` | Filter, Stage, Deal-Value |
| `log_interaction` | `log-interaction.ts` | `last_touchpoint`-Update + Audit-Log |
| `update_deal` | `update-deal.ts` | Upsert by dealName + Audit-Log |
| `update_customer_facts` | `update-customer-facts.ts` | Patch-Semantik + Audit-Log |
| `export_customer` | `export-customer.ts` | JSON + Markdown |
| `get_active_session` | `get-active-session.ts` | Session + Owner |

- Transport: stdio + HTTP (StreamableHTTP, Port 3847)
- **On-Query-Sync**: `get_customer_context()` triggert automatisch Gmail-Sync wenn >30 min seit letztem Sync

#### Daemon
- `src/daemon/worker.ts` — alle 30 Minuten, MAX 50 Kunden/Zyklus
- Exponential Backoff: `2^attempt × 2000ms`
- `dxcrm daemon start/stop/status`

#### Concurrent-Write-Hardening
- `src/fs/write-queue.ts` — Barrier-basierte Promise-Queue pro Dateipfad
- `appendInteraction` wrapped in `withFileQueue`

#### CLI-Commands
| Command | Status |
|---|---|
| `dxcrm init` | ✅ |
| `dxcrm create` | ✅ |
| `dxcrm list` | ✅ |
| `dxcrm sync [--provider gmail\|microsoft\|transcripts]` | ✅ |
| `dxcrm session open/close/status [--owner]` | ✅ |
| `dxcrm validate` | ✅ (--fix Flag akzeptiert, aber nicht implementiert — siehe Lücken) |
| `dxcrm guide` / `dxcrm mcp docs` | ✅ |
| `dxcrm backup [path]` | ✅ |
| `dxcrm backup schedule --every day --keep 7` | ✅ |
| `dxcrm restore` | ✅ |
| `dxcrm daemon start/stop/status` | ✅ |
| `dxcrm status [--unmatched]` | ✅ |

---

### Phase 2 — Flywheel ✅

#### `dxcrm agent spawn` — Wake-Trigger-Pipeline
- `src/commands/agent.ts` — Config schreiben, Status, Remove
- `src/daemon/worker.ts` — Daemon-Integration: erkennt neue E-Mails, liest Agent-Config, sendet Telegram
- Telegram-Notification: `https://api.telegram.org/bot${token}/sendMessage` via fetch
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` Env-Vars
- Wake-Trigger: neue Gmail-Nachrichten → Telegram-Nachricht mit Zusammenfassung
- **Einschränkung**: Daemon läuft alle 30 min, kein Echtzeit-Trigger (<5 min spec)

#### CRM-Import
- **HubSpot CSV**: `dxcrm import --from hubspot ./export.csv`
- **Salesforce API**: `dxcrm import --from salesforce --mode api --token X --url Y`
- **Pipedrive API**: `dxcrm import --from pipedrive --mode api --token X --url Y`
- **CSV generisch**: `dxcrm import ./data.csv`
- **LLM-Feldmapping**: `mapCsvFields()` + `mapCsvFieldsHeuristic()` Fallback
- **Alias-Tabelle**: HubSpot, Pipedrive, Salesforce, generische Spaltennamen erkannt
- Zwei-Pass-Import: Entities zuerst, dann Aktivitäten
- Idempotenz: sourceRef-Prüfung verhindert Duplikate
- sourceRefs: `hubspot://activity/<id>`, `salesforce://task/<id>`, `pipedrive://activity/<id>`, `csv://row/<hash>`

---

### Phase 3 — Team-Schicht ✅

#### VM-Deployment
- `dxcrm server start [--port 3847] [--data /mnt/crm-data]`
- PID-File: `.agentic/server.pid`
- `dxcrm server status`
- HTTP MCP-Server auf Port 3847

#### Session Ownership
- `dxcrm session open <slug> [--owner alice]`
- `owner` aus `--owner` oder `DXCRM_ACTOR` Env-Var
- `get_active_session()` gibt `{ owner }` zurück
- **Einschränkung**: Session-State nur lokal, nicht über HTTP-Server geteilt

#### Audit Trail
- `src/fs/audit-log.ts` — append-only, `fs.appendFileSync` (atomar <4096 Bytes)
- Format: `2026-06-01T09:14:00Z | alice | log_interaction | acme-corp | summary`
- Alle Schreib-Tools schreiben Audit-Eintrag: `log_interaction`, `update_deal`, `update_customer_facts`, `gdpr erase`
- `dxcrm audit [--slug] [--actor] [--limit] [--tail]`

#### `dxcrm init --team <url>`
- Schreibt HTTP-URL in Framework-Configs statt stdio-Config
- Zeigt `export DXCRM_ACTOR=<your-name>` Hinweis

---

### Phase 4 — Enterprise (Implementiert)

#### RBAC — Konfiguration und CLI
- `src/core/rbac.ts` — Rollen: admin, manager, rep
- Permission-Matrix: `ALLOWED_TOOLS` pro Rolle
- `.agentic/rbac.json` — Config-Datei
- `dxcrm rbac set <actor> <role>`
- `dxcrm rbac show`
- `dxcrm rbac check <actor> <tool>` (Exit 0 = allowed)
- `getRole`, `canWrite`, `assertCanWrite` Funktionen
- **⚠️ KRITISCHE LÜCKE**: `assertCanWrite` wird in keinem MCP-Tool aufgerufen — keine Enforcement!

#### GDPR-Erasure
- `dxcrm gdpr erase <slug>` — Dry-Run ohne `--confirm`
- `dxcrm gdpr erase <slug> --confirm` — `fs.rmSync(dir, {recursive: true})`
- Audit-Log-Eintrag nach Erasure
- `.agentic/gdpr-erasures.json` — Lösch-Protokoll
- `dxcrm gdpr list-erasures`
- **⚠️ KRITISCHE LÜCKE**: Keine LanceDB-Bereinigung — Vektoren bleiben nach Erasure bestehen

#### Microsoft Outlook Sync
- `src/sync/microsoft-auth.ts` — liest `.agentic/microsoft-token.json`
- `src/sync/microsoft-sync.ts` — Microsoft Graph API, LLM-Zusammenfassung
- `dxcrm sync --provider microsoft`
- sourceRef: `microsoft://message/<id>`
- **Einschränkung**: Nur E-Mails, keine Kalender-Events

#### Security Report
- `dxcrm security-report [--output <file>]`
- Generiert Markdown-Fragebogen: Datenhaltung, Auth, Verschlüsselung, GDPR, SOC 2

---

### Phase 5 — Migration ✅

- `update_customer_facts` MCP-Tool (9. Tool) — Profil-Felder patchen
- Pipedrive API-Import — Persons → Kunden, Activities → Interaktionen
- `mapCsvFieldsHeuristic` — Alias-Tabelle für Spaltennamen
- `mapCsvFields` — LLM-gestütztes Mapping mit Heuristic-Fallback

---

## TEIL 2: WAS FEHLT (Priorisiert)

### 🔴 KRITISCH — Sicherheits- und Compliance-Lücken

---

#### LÜCKE 1: RBAC-Enforcement in MCP-Tools
**Spec (plan.md Zeile 502):** "MCP-Server erzwingt Berechtigungen pro Tool-Aufruf. `get_customer_context()` respektiert Rolle."

**Ist-Stand:** `assertCanWrite` existiert in `src/core/rbac.ts` aber wird in **keinem** MCP-Tool aufgerufen. Jeder Anrufer kann jedes Tool ausführen, unabhängig von Rolle.

**Was fehlt:**
- Enforcement-Block am Anfang jedes Tool-Handlers (z.B. `log_interaction`, `update_deal`, `update_customer_facts`, `export_customer`)
- `get_customer_context()` filtert Ergebnisse nach `can_see: ["own_customers"]` für `rep`-Rolle
- Tests für Zugriffsverweigerung bei falschem Rollenkontext

**Aufwand:** ~3 Tage
**Impact:** Enterprise-Deployment unsicher ohne Enforcement

---

#### LÜCKE 2: GDPR-Erasure löscht LanceDB nicht
**Spec (plan.md Zeile 521):** "`dxcrm gdpr erase <slug>` → Löscht alle Dateien, **entfernt aus LanceDB**, schreibt Löschprotokoll"

**Ist-Stand:** `src/commands/gdpr.ts` löscht nur `customers/<slug>/` Verzeichnis. Die Vektoren in `.agentic/lancedb/` bleiben bestehen.

**Was fehlt:**
- Nach `fs.rmSync(customerDir)`: LanceDB-Tabelle öffnen, alle Rows mit `sourceRef LIKE 'customers/<slug>/%'` löschen oder Tabelle für diesen Slug droppen
- Test: nach Erasure darf `search_customer_knowledge` keine Ergebnisse mehr für den Slug liefern

**Aufwand:** ~2 Tage
**Impact:** GDPR-Compliance unvollständig — Kundendaten verbleiben in Vektor-DB

---

### 🟠 HOCH — Funktionale Lücken

---

#### LÜCKE 3: `dxcrm validate --fix` ohne Implementierung
**Spec CLI-Reference:** "Auto-fix recoverable issues (missing fields with defaults)"

**Ist-Stand:** `src/commands/validate.ts` akzeptiert `--fix` Flag (Zeile 9), aber kein Code reagiert darauf. Flag wird ignoriert.

**Was fehlt:**
- Bei `--fix`: für jeden Validierungsfehler der "recoverable" ist (fehlendes optionales Feld), Default-Wert einsetzen und `main_facts.md` überschreiben
- Recoverable: fehlende `tags` → `[]`, fehlendes `currency` → `"EUR"`, fehlendes `updated` → `created`-Datum
- Nicht-recoverable (fehlender `name`, ungültige Stage): Error ohne Fix, User informieren

**Aufwand:** ~1 Tag

---

#### LÜCKE 4: Microsoft Kalender-Events fehlen
**Spec (plan.md Zeile 505):** "`microsoft-sync.ts`: Microsoft Graph MCP → **E-Mails + Kalenderevents** → gleiche Pipeline wie Gmail"

**Ist-Stand:** `src/sync/microsoft-sync.ts` fetcht nur `GET /v1.0/me/messages`. Keine Kalender-Integration.

**Was fehlt:**
- `GET /v1.0/me/calendarView` mit `startDateTime` / `endDateTime` Parameter
- Kalender-Event → Interaction vom Typ `Meeting`
- sourceRef: `microsoft://event/<id>`
- Auth-Token-Scope: `Calendars.Read` (zusätzlich zu `Mail.Read`)

**Aufwand:** ~2 Tage

---

#### LÜCKE 5: `dxcrm status` zeigt kein Team-Überblick
**Spec (plan.md Zeile 469):** "`dxcrm status` zeigt: wer welchen Kunden offen hat, letzter Touchpoint, offene Deal-Health"

**Ist-Stand:** `src/commands/status.ts` zeigt nur lokale Session. Kein Überblick über alle Team-Sessions.

**Was fehlt (auf HTTP-Server):**
- HTTP-Server exposes `GET /sessions` — gibt alle aktiven Sessions zurück (gelesen aus `.agentic/session.json`)
- `dxcrm status` auf Client: wenn HTTP-Server erreichbar, fragt `/sessions` ab und zeigt Team-Überblick

**Aufwand:** ~2 Tage  
**Voraussetzung:** Shared filesystem (bereits gegeben bei VM-Deployment)

---

#### LÜCKE 6: Salesforce Export-ZIP-Import fehlt
**Spec (plan.md Zeile 426):** "`dxcrm import --from salesforce ./salesforce-export.zip`"

**Ist-Stand:** Nur `--mode api` implementiert. File-Import für Salesforce-ZIP-Exporte fehlt.

**Was fehlt:**
- ZIP entpacken (Node `zlib` / `unzip` oder `adm-zip`)
- Accounts.csv → Kunden, Activities.csv / Tasks.csv → Interaktionen
- Salesforce-spezifisches Feld-Mapping (LLM-gestützt via `mapCsvFields`)
- sourceRef: `salesforce://row/<hash>`

**Aufwand:** ~3 Tage

---

#### LÜCKE 7: Pipedrive File-/Verzeichnis-Import fehlt
**Spec (plan.md Zeile 427):** "`dxcrm import --from pipedrive ./pipedrive-export/`"

**Ist-Stand:** Nur `--mode api` implementiert.

**Was fehlt:**
- CSV-Dateien aus Verzeichnis oder ZIP lesen
- `organizations.csv` → Kunden, `activities.csv` → Interaktionen
- Reuse von `mapCsvFields` für Pipedrive-Spaltennamen

**Aufwand:** ~2 Tage

---

### 🟡 MITTEL — Qualitäts- und Vollständigkeitslücken

---

#### LÜCKE 8: RBAC Data-Visibility-Filtering (`can_see`)
**Spec (plan.md Zeile 497):** `"rep": { "can_see": ["own_customers"] }`

**Ist-Stand:** Roles kontrollieren nur Schreibrechte (`can_write`). `get_customer_context()` und `list_customers()` zeigen allen Rollen alle Kunden.

**Was fehlt:**
- `rep`-Rolle: `list_customers` und `get_customer_context` nur für Kunden bei denen `DXCRM_ACTOR` als letzter Touchpoint/Owner erscheint
- Konfiguration: `owned_customers` Zuordnung in `rbac.json` oder via `primary_contact`-Feld

**Aufwand:** ~4 Tage  
**Komplexität:** Hoch (benötigt Ownership-Konzept pro Kunde)

---

#### LÜCKE 9: Artifacts-Ordner ohne Verwendung
**Spec (plan.md Zeile 556):** `artifacts/` für PDFs, Verträge, Proposals

**Ist-Stand:** Verzeichnis wird von `ensureCustomerDir` angelegt, aber keine CLI-Commands oder MCP-Tools verarbeiten Dateien darin.

**Was fehlt:**
- `dxcrm attach <slug> <file>` — kopiert Datei nach `customers/<slug>/attachments/`
- `export_customer` listet Attachments auf
- Optional: `get_customer_context` erwähnt vorhandene Attachments

**Aufwand:** ~2 Tage

---

#### LÜCKE 10: `.agentic/schema.json` nicht generiert
**Spec (plan.md Zeile 544):** `.agentic/schema.json` — Validierungsregeln (auto-geschrieben von init)

**Ist-Stand:** Kein `schema.json` wird von `dxcrm init` angelegt. Validierung läuft direkt über Zod-Schemas im Code.

**Was fehlt:**
- `dxcrm init` schreibt `.agentic/schema.json` mit serialisierten Validierungsregeln (JSON-Schema-Format aus Zod)
- Nutzbar für externe Tools, die ohne Node.js validieren wollen

**Aufwand:** ~1 Tag  
**Priority:** Niedrig (kein funktionaler Blocker)

---

#### LÜCKE 11: Konfigurierbare Pipeline-Stages
**Spec (plan.md Zeile 280):** "Enterprise erhält konfigurierbare Stages in Phase 4."

**Ist-Stand:** Stage-Enum ist hartcodiert in `src/schemas/pipeline.ts` (7 Werte: lead, qualified, discovery, proposal, negotiation, won, lost).

**Was fehlt:**
- `.agentic/config.json` erlaubt `customStages: string[]` 
- Pipeline-Validierung liest Config; Zod-Schema generiert dynamisch
- `dxcrm config stages add <name>` / `dxcrm config stages list`

**Aufwand:** ~3 Tage

---

#### LÜCKE 12: Agent Wake-Trigger — Timing
**Spec (plan.md Zeile 431):** "binnen 5 Minuten erhält der Owner eine Telegram-Nachricht"

**Ist-Stand:** Daemon läuft alle 30 Minuten. Telegram-Notification-Logik ist implementiert, aber frühestens nach 30 min, nicht 5 min.

**Was fehlt:**
- Daemon-Intervall konfigurierbar machen (`DXCRM_DAEMON_INTERVAL` Env-Var)
- Standard: 30 min für normale Syncs
- `--fast` Modus: 5 min für Accounts mit aktiven Agents
- Oder: Webhook-basierter Trigger statt Polling (Gmail Push Notifications via Pub/Sub)

**Aufwand:** ~1 Tag (Intervall-Konfig) / ~5 Tage (Gmail Pub/Sub Webhooks)

---

### 🟢 NIEDRIG — Nice-to-have

---

#### LÜCKE 13: LanceDB-Indexierung in `log_interaction` nicht bestätigt
`src/mcp/tools/log-interaction.ts` hat LanceDB-Indexierung im try/catch (non-blocking), aber kein Test prüft ob der Index tatsächlich geschrieben wird.

**Was fehlt:** Integration-Test der nach `log_interaction` eine `search_customer_knowledge`-Abfrage ausführt und den neuen Eintrag findet.

**Aufwand:** ~1 Tag

---

#### LÜCKE 14: `dxcrm mcp start --http` Auto-Reload
Kein File-Watcher auf Kundendaten. Agenten müssen `get_customer_context` manuell erneut aufrufen nach externen Datenänderungen.

**Was fehlt:** Optionaler SSE-Stream für Cache-Invalidierung oder einfach dokumentieren dass On-Query-Sync das löst.

**Aufwand:** Dokumentation reicht

---

## TEIL 3: PRIORISIERTE ROADMAP

### Sprint 6 (Woche 1-2): Sicherheit schließen
| # | Lücke | Aufwand | Impact |
|---|---|---|---|
| 1 | RBAC-Enforcement in MCP-Tools | 3 Tage | 🔴 Kritisch |
| 2 | GDPR LanceDB-Cleanup | 2 Tage | 🔴 Kritisch |
| 3 | `validate --fix` Implementierung | 1 Tag | 🟠 Hoch |

**Ziel:** Enterprise-Deployment sicher und GDPR-compliant.

---

### Sprint 7 (Woche 3-4): Migration vollständig
| # | Lücke | Aufwand | Impact |
|---|---|---|---|
| 4 | Salesforce ZIP-Import | 3 Tage | 🟠 Hoch |
| 5 | Pipedrive File-Import | 2 Tage | 🟠 Hoch |
| 6 | Microsoft Kalender-Events | 2 Tage | 🟠 Hoch |

**Ziel:** "Ein Team migriert von HubSpot/Salesforce/Pipedrive mit einem Befehl" — vollständig.

---

### Sprint 8 (Woche 5-6): Team-Features
| # | Lücke | Aufwand | Impact |
|---|---|---|---|
| 7 | `dxcrm status` Team-Überblick | 2 Tage | 🟠 Hoch |
| 8 | RBAC Data-Visibility (can_see) | 4 Tage | 🟡 Mittel |
| 9 | Konfigurierbare Pipeline-Stages | 3 Tage | 🟡 Mittel |

**Ziel:** Team-Koordination sichtbar, Enterprise-Datenisolierung vollständig.

---

### Backlog (keine feste Timeline):
| # | Lücke | Aufwand | Impact |
|---|---|---|---|
| 10 | Artifacts/Attachments | 2 Tage | 🟡 Mittel |
| 11 | `.agentic/schema.json` generieren | 1 Tag | 🟢 Niedrig |
| 12 | Agent-Timing-Konfiguration | 1 Tag | 🟢 Niedrig |
| 13 | LanceDB-Indexierungs-Test | 1 Tag | 🟢 Niedrig |

---

## TEIL 4: WIDERSPRÜCHE ZWISCHEN SPEC UND CODE

Die folgenden Punkte sind in `plan.md` als "offen" markiert, wurden aber bereits implementiert:

| Spec-Zeile | Spec-Behauptung | Tatsächlicher Status |
|---|---|---|
| 154 | "LLM-Extraktion noch nicht implementiert" | ✅ `src/sync/gmail-sync.ts:59-60` |
| 164 | "unmatched-transcripts noch nicht implementiert" | ✅ `src/fs/unmatched-transcripts.ts` |
| 200 | "On-Query-Sync noch offen — Phase 2" | ✅ `src/mcp/tools/get-customer-context.ts:12-40` |
| 215 | "`last_touchpoint`-Update noch nicht implementiert" | ✅ `src/mcp/tools/log-interaction.ts:46-62` |
| 316 | "`backup schedule` offen für Phase 2" | ✅ `src/commands/backup.ts` + Daemon |
| 340 | "`last_touchpoint` in `main_facts.md` offen" | ✅ implementiert |

**Fazit:** Der Stand ist besser als die Spec dokumentiert. Die Spec wurde nach Phase 1-Abschluss nicht aktualisiert.

---

## TEIL 5: TEST-COVERAGE-ÜBERSICHT

| Bereich | Dateien | Tests | Status |
|---|---|---|---|
| Schemas | `__tests__/schemas/` | 55 | ✅ |
| FS-Layer | `__tests__/fs/` | 47 | ✅ |
| MCP-Tools | `__tests__/mcp/tools/` | 36 | ✅ |
| Commands | `__tests__/commands/` | 130 | ✅ |
| Setup/Adapters | `__tests__/setup/` | 65 | ✅ |
| Sync | `__tests__/sync/` | 37 | ✅ |
| Core (LLM, RBAC) | `__tests__/core/` | 181 | ✅ |
| **Gesamt** | **59 Dateien** | **551 Tests** | ✅ alle grün |

**Fehlende Tests:**
- RBAC-Enforcement in MCP-Tools (Lücke 1 — gibt es noch nicht)
- GDPR + LanceDB-Cleanup (Lücke 2 — gibt es noch nicht)
- Nach-Erasure-Suche schlägt fehl (Integration-Test fehlt)
- `validate --fix` (Lücke 3 — Flag ohne Implementierung)

---

## ZUSAMMENFASSUNG

Von den **6 Dominoes** des ursprünglichen Plans sind **5 vollständig** und **1 partial** implementiert:

- **Domino 1–3 und 5**: Vollständig ✅
- **Domino 4 (Enterprise)**: Code vorhanden, aber RBAC-Enforcement und GDPR-LanceDB sind kritische Lücken ❌
- **Domino 6 (Enterprise-Deployment)**: Infrastruktur vorhanden, Datenisolierung (can_see) fehlt

**Für ein erstes echtes Enterprise-Deployment fehlen zwingend:**
1. RBAC-Enforcement (3 Tage) — ohne das ist Multi-User-Sicherheit nicht gegeben
2. GDPR-LanceDB-Cleanup (2 Tage) — ohne das ist GDPR-Compliance unvollständig

**Gesamtaufwand für vollständige Spec-Erfüllung:** ~32 Arbeitstage (Sprints 6–8 + Backlog)

---

## TEIL 6: SPRINT 9 — End-to-End Testing + Endnutzer-Dokumentation

**Ziel:** Das npm-Package als fertiges Produkt validieren und dokumentieren — für echte User, nicht nur Entwickler.

### 6.1 End-to-End Tests (`__tests__/e2e/`)

Smoke-Tests des kompletten CLI- und MCP-Stacks mit realem Dateisystem (memfs), ohne gemockte Implementierungen. Testet den gesamten User-Journey vom ersten `dxcrm init` bis zur MCP-Tool-Antwort.

**Abzudeckende Workflows:**
1. Init → Create → List (kompletter Onboarding-Pfad)
2. Create → log_interaction → get_customer_context (Core Loop)
3. Create → update_deal → export_customer (Pipeline-Workflow)
4. Import (CSV) → list_customers → search_customer_knowledge
5. rbac set → rbac check (Permissions-Flow)
6. gdpr erase dry-run → gdpr erase --confirm (Compliance-Flow)
7. backup → restore (Datensicherungs-Flow)

**Dateien:**
- `__tests__/e2e/cli-workflow.test.ts` — CLI-Befehle als Black-Box
- `__tests__/e2e/mcp-workflow.test.ts` — MCP-Tool-Kette end-to-end
- `__tests__/e2e/import-workflow.test.ts` — Import + Search

### 6.2 README.md (Endnutzer-facing, Repo-Startseite)

Vollständige, copy-paste-fähige Anleitung. Ersetzt die aktuelle README mit:
- 5-Minuten-Quickstart (3 Befehle bis zum ersten Agenten)
- Vollständige CLI-Command-Referenz mit Beispielen
- Alle 9 MCP-Tools mit Input/Output-Beispielen
- Framework-Integration-Snippets (Claude Code, Codex, Cursor, Claude Desktop)
- Team-Setup-Anleitung (VM + HTTP-Server)
- Enterprise-Features (RBAC, GDPR, Security-Report)
- Integrations-Matrix (Gmail, Outlook, Salesforce, Pipedrive)

### 6.3 `docs/index.html` (Standalone HTML-Dokumentation)

Einzelne HTML-Datei, die man ohne Server öffnen kann (`file:///` protocol). Kein Build-Tool, keine externen CDN-Abhängigkeiten — alles inline.

**Inhalt:**
- Navigation (Sidebar oder Tabs)
- Getting Started
- CLI Reference (alle Commands, Flags, Beispiele)
- MCP Tools Reference (alle 9 Tools, Schemas, Response-Beispiele)
- Framework Integration (Code-Snippets)
- Schemas (main_facts, interactions, pipeline, sources)
- Team & Enterprise (RBAC, GDPR, Deployment)
- Changelog

### 6.4 Agent-Kontext-Datei (`src/core/agent-context.ts`)

Vollständiger, maschinenlesbarer Funktionsumfang des CRM. Wird in alle Framework-Harness-Dateien eingebettet (CLAUDE.md, AGENTS.md, SOUL.md). Enthält:
- Alle 9 MCP-Tools mit vollständigen Schemas und Beispiel-Aufrufen
- Workflow-Anleitungen (wann welches Tool, in welcher Reihenfolge)
- Datenstruktur und Dateipfade
- Einschränkungen und Fehlerbehandlung
- RBAC-Matrix

**Status:** ✅ IMPLEMENTIERT (Sprint 9 abgeschlossen, siehe unten)
