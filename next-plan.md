# next-plan.md — Roadmap: Enterprise-Level, agenten-natives CRM

> **Quelle:** Whitepaper „Aufbau eines headless, agenten-nativen CRM als npm-Paket und MCP-Server".
> **Zweck:** Klare, priorisierte Roadmap vom **heutigen** DatasynxOpenCRM zur Enterprise-Vision — eine
> neue Art CRM, das Salesforce/HubSpot im **Kern** ersetzt (≈80 % der real genutzten Features, nicht
> 100 % des existierenden Funktionsumfangs).
> **Verhältnis zu `plan.md`:** `plan.md` = Phase-1–4-Spec (Domino-Sequenz, weitgehend umgesetzt).
> `next-plan.md` = die *nächste* Ausbaustufe Richtung metadaten-getriebenes, MCP-natives System of Record.

---

## 1. Die These

Ein headless, API-only CRM, das als **ein npm-Paket** gleichzeitig **MCP-Server** und **TypeScript-SDK**
ist, kann Salesforce/HubSpot im Kern ersetzen — wenn es (a) die Feature-Matrix Sales/Service/Marketing/
Data/Platform abdeckt, (b) sie **agenten-nativ** über das Model Context Protocol exponiert, und (c) auf
einem **metadaten-getriebenen Datenmodell** mit Runtime-Schema läuft (No-Migration-Pattern — der
entscheidende Differenzierer gegenüber starren SaaS-CRMs).

**Unser Moat bleibt:** local-first, Markdown als menschenlesbare Source-of-Truth, GDPR/Datensouveränität,
`npm install`-Distribution, MCP-nativ. Den geben wir **nicht** für ein Twenty-artiges Postgres-Schema-pro-
Workspace-Modell auf — wir erweitern ihn (siehe Architektur-Entscheidung A1).

---

## 2. Wo wir heute stehen (ehrliche Bestandsaufnahme — codeverifiziert)

> Belegt durch tiefe Code-Analyse (MCP-Layer · Datenmodell/Storage/Memory · Feature/Compliance-Inventar).

| Vision-Baustein (Whitepaper) | opencrm heute | Beleg / Delta |
|---|---|---|
| Dual npm-Paket (MCP-Server + SDK) | ✅ `bin` + `exports` (`.` + `./mcp`), Dual ESM/CJS, `prepublishOnly` | `server.json` (Registry) fehlt |
| MCP-Server | ✅ **56 Tools** (inkl. 4 Custom-Object-Tools), **4 Resources**, **4 Prompts** (Playbooks), stdio **+** stateless Streamable HTTP | kein `instructions`-Feld, kein Tool-Search (offen: N1-3/N1-5) |
| Auth (HTTP `/mcp`) | ✅ **Bearer-Token-Gate** (opt-in via `dxcrm mcp token` oder `DXCRM_MCP_AUTH=required`), RFC-9728-Metadata + 401/`WWW-Authenticate`, SHA-256-gehashte Tokens, Actor→RBAC (`src/mcp/auth.ts`) | Voller OAuth-Flow gegen externen AS (PKCE/JWKS) optional/später; per-Request-Actor-Propagation in RBAC noch env-basiert |
| RBAC | ✅ tool-level via `DXCRM_ACTOR` + `.agentic/rbac.json` (admin/manager/rep) | nicht request-/token-gebunden; Sharing-Rules nur grob (owned_customers) |
| Datenmodell | 🔴 **11 feste Zod-Schemas** (main_facts/interaction/pipeline/ticket/quote/sequence/survey/kb/agent-config/sources/email-template) | **null Custom Objects/Fields, keine Composite-Typen, keine Runtime-Metadaten** (`src/schemas/`) |
| Storage | ✅ Markdown+Frontmatter als SoT, `write-queue`/`file-lock` für Concurrency | bewusst keine DB — Moat |
| Vektor/Memory | ✅ **reif:** LanceDB embedded, Xenova/all-MiniLM-L6-v2 (384-dim, lokal), Hybrid-Search | — |
| Knowledge-Graph | 🟡 **hand-rolled `graph.json`** (Nodes/Edges, weight/lastContact/contactCount) + BFS + Health-Scoring; **bi-temporale Edge-Felder + invalidateEdge/activeEdges vorhanden** (N6-1 v1) | Auto-Invalidation widersprüchlicher Fakten + embedded Graph-DB (Kùzu) offen |
| Sales | ✅ Deals/Pipeline, Forecast, Monte-Carlo-Sim, Deal-Health (A–F), Relationship-Graph/-Health, Org-Intelligence, Playbooks, Goals, Lead/Opp-Import | Opportunity-Scoring teils heuristisch |
| Service | 🟡 Tickets + **SLA-Engine** (`sla-engine.ts`, YAML-Regeln), vektorisierte KB | Omni-Channel-Routing, Eskalation/transfer-to-human als Action |
| Marketing/Data | 🟡 Email-Templates, **lineare** Sequences (skipIfReplied), NPS/CSAT/CES, Email-Dedup | Journeys (Branching), Segmente/Listen, CDP/Identity-Resolution, Unified Profiles |
| Platform/Automation | 🟡 Proactive Worker (7-Uhr-Cron), Playbooks, Goals, **Push-Manager**, **`webhook-receiver`** (Stripe/Linear/GitHub/Calendly + Signaturen) | Custom Objects via Metadata-API, **CRUD-Webhook-Events**, Workflow-Engine |
| Agent-Harness | 🟡 **Eigenbau** (deal-agent, proactive-worker) auf direktem `@anthropic-ai/sdk` (Haiku) | **kein** Mastra/LangGraph/Claude-Agent-SDK → A3 ist echte Migration |
| Compliance | ✅ RBAC, Audit-Log, GDPR-Erase, security-report, **AES-256-GCM-Feldverschlüsselung** (`encryption.ts`), `input-guard` (Längen/Typ/Byte-Limit) | **kein PII-Masking vor LLM**, **keine Guardrails** (Toxizität/Prompt-Injection), keine bi-temporale Auditierbarkeit |

**Kurz:** Sales-Kern, Sync, Vektor-Memory, Health-Scoring und Compliance-Basis sind **reif**. Die drei
großen Deltas zur Whitepaper-Vision sind unverändert: **(1) metadaten-getriebenes Datenmodell,
(2) MCP-Resources/Prompts + OAuth 2.1, (3) bi-temporaler Memory-Graph.** Wichtige Nuance aus der Analyse:
mehrere „neue" Pakete sind in Wahrheit **Upgrades vorhandener Bausteine** (Graph→bi-temporal,
Webhook-Receiver→CRUD-Events, Email-Dedup→Identity-Resolution, Encryption ist schon da).

---

## 3. Strategische Architektur-Entscheidungen (zuerst zu klären)

**A1 — Datenmodell: Markdown bleibt Source-of-Truth, Metadaten-Layer obendrauf.**
Kein Postgres-Schema-pro-Workspace (würde local-first/Markdown-Moat brechen). Stattdessen:
ein `objectMetadata`/`fieldMetadata`-Äquivalent in `.agentic/schema/` (JSON), das **Custom Objects/Fields**
beschreibt; Records weiterhin als Markdown + Frontmatter; ein **Runtime-Typ-/Validierungs-Layer** (Zod aus
Metadaten generiert) und ein **permission-aware Query-Layer**. Composite-Feldtypen (ADDRESS/FULL_NAME/
CURRENCY/EMAILS/PHONES/LINKS) wie bei Twenty.
*Befund:* Die 11 Schemas sind heute hart-codiert; Graph-Nodes/Edges haben aber bereits ein offenes
`properties: Record<string, unknown>` — der Custom-Field-Layer kann **inkrementell** eingeführt werden
(erst Frontmatter-Passthrough + Metadaten-Registry, dann Runtime-Zod), ohne Big-Bang-Rewrite.

**A2 — Embedded Storage & Graph: in-place upgraden statt ersetzen.** LanceDB (Vektoren) ist reif und bleibt.
Der Knowledge-Graph ist heute `graph.json` (hand-rolled, current-state). Zwei Optionen für Bi-Temporalität:
**(A2a)** `graph.json`-Schema um vier Zeitstempel/Edge erweitern + Edge-Invalidation statt Löschen
(kleiner Schritt, kein neues Dependency, bleibt local-first) — **empfohlen für den Prototyp**;
**(A2b)** embedded **Kùzu** (Cypher, file-basiert) für Skalierung/Cypher-Queries — später, ab Bedarf.
Produktions-Pfad pgvector/Neo4j erst ab Schwellen (>5 Mio Vektoren / hohe Concurrency).

**A3 — Agent-Harness wählen, nicht bauen:** primär **Claude Agent SDK** (Hooks für Audit/Security,
Subagents), **Mastra** für TS-Workflows/Memory, **Hermes** für self-hosted/data-sovereign. Eigene
Agent-Loop-Logik nur als dünne Orchestrierung.

**A4 — MCP-Konsolidierung:** **ein** konsolidierter CRM-Server mit Tool-Search/Lazy-Loading statt vieler
fragmentierter Server (vermeidet Kontext-Überlauf). Spec-Ziel **2025-11-25** (Icons, inkrementelle Scopes,
Elicitation).

---

## 4. Phasen-Roadmap (klein → groß)

Status-Legende: ✅ vorhanden · 🟡 teilweise · 🔲 neu

### Phase N1 — Core-Plattform & MCP-Vollausbau  *(Fundament)*
- 🔲 **Metadaten-Datenmodell** (`@crm/core`): `object/fieldMetadata` in `.agentic/schema/`, Composite-Typen, Runtime-Zod-Generierung, permission-aware Query-Layer (A1)
- 🔲 **MCP Resources**: Entity-Records & Listen als `crm://people/{id}`, `crm://pipeline/{slug}` (Resource-Templates, Icons-Metadaten)
- 🔲 **MCP Prompts**: Playbooks als Prompts („Deal-Risiko bewerten", „Follow-up entwerfen", „Account-Brief")
- 🔲 **Elicitation** bei fehlenden Pflichtfeldern (strukturiertes Schema statt Fehler)
- 🔲 **OAuth 2.1 Resource Server** für HTTP-Transport (RFC 9728 `/.well-known/oauth-protected-resource`, RFC 8707 Audience-Binding, PKCE-S256, Tokens nur SHA-256-gehasht) — löst B1
- 🔲 **Tool-Search / Lazy-Loading** (A4)
- 🔲 **Registry-Listing**: `server.json`, Publikation auf `registry.modelcontextprotocol.io` via GitHub-OIDC

### Phase N2 — Sales (vertiefen)  *(Kern-Ersatz Salesforce Sales Cloud)*
- ✅ Deals/Pipeline, Forecast, Deal-Health, Sequences · ✅ Lead-Import (Salesforce/HubSpot)
- 🟡 **Salesforce-Migration vervollständigen** (siehe `plan.md` Domino 4c, parallele Arbeit A1–A7): Events, Cases→Tickets, Notes/Attachments, Products/LineItems, Campaigns, Custom Fields, Owner→Actor
- 🔲 **Opportunity-Scoring** (LLM-gestützt, nicht nur Heuristik)
- 🔲 **Territory/Forecast-Kategorien** (Pipeline/Best Case/Commit) — optional, depriorisiert

### Phase N3 — Service
- 🟡 Tickets/SLAs vorhanden → 🔲 **Omni-Channel-Routing** (skill/priority), 🔲 **vektorisierte KB** mit Eskalation, 🔲 **Transfer-to-Human als MCP-Action**

### Phase N4 — Marketing & Data
- 🟡 Templates/Sequences/NPS → 🔲 **Segmente/Listen**, 🔲 **Journeys**, 🔲 **Lead-Scoring/Grading**
- 🔲 **CDP-Funktion**: Identity Resolution (deterministisch + probabilistisch), Unified Profiles, Calculated Insights (CLV/Engagement)

### Phase N5 — Platform & Automation  *(der Differenzierer)*
- 🔲 **Custom Objects/Fields via Metadata-API** (No-Migration-Pattern) — baut auf N1
- 🔲 **Workflow-Engine**: event-driven, **Webhooks bei Create/Update/Delete** (exp. Backoff + Replay-Store)
- 🔲 **Permissions/Roles/Sharing-Rules-Äquivalent** auf Objekt-/Feld-/Zeilen-Ebene (RBAC ausbauen)
- 🔲 **Code-Actions** (sichere, sandboxed Automation-Hooks)

### Phase N6 — Agentische Revenue-Intelligence
- 🔲 **Bi-temporaler Wissensgraph** voll integriert (4 Zeitstempel/Edge, Edge-Invalidation statt Löschen, Provenance/Zitierbarkeit) — Memory-Primitiv ab N1 verankern, hier vollenden
- 🔲 **Prädiktive Revenue-Intelligence**, Conversation Insights (Call-Transkript-Analyse)
- 🔲 **Multi-Agent-Orchestrierung** (Subagents/Handoffs), **Command-Center-Observability** (Containment-Rate, Reasoning-Accuracy)

---

## 5. Querschnitt: Memory & Compliance (ab N1 verankern, nicht nachrüsten)
- **CoALA-Mapping:** episodisch = Activity-Log/Conversations · semantisch = Entity-Graph · prozedural = Playbooks/Workflows
- **EU AI Act / GDPR:** PII-Masking vor jedem LLM-Call · Audit-Logging via Hooks (jeder Tool-Call mit In/Out) · Guardrails (Toxizität, Prompt-Injection, Indirect-Injection per ACL) · Human-in-the-Loop via Elicitation/Permissions · bi-temporale Edges = zeitliche Nachvollziehbarkeit jedes Faktenstands

---

## 6. GTM / Positionierung
Open-Core · Developer-first · **Doku als token-to-value-optimiertes GTM-Asset** (Agenten lesen Doku, keine
Pitch-Decks) · Free-Tier für Adoption, Team-Pricing, Enterprise für Compliance/SSO/SOC-2 · **usage-based**
für Agent-Aktionen (Vorbild Agentforce Flex Credits, ~0,10 USD/Action). Kernbotschaft: **TCO-Vorteil**
gegenüber Salesforce-Lizenzstacks (360k–750k+ USD/Jahr Erstjahr für Data 360 + Marketing + Service +
Agentforce + SI).

---

## 7. Risiken & Caveats
- **MCP entwickelt sich schnell:** Spec 2025-11-25 → RC 2026-07-28, TS-SDK v2 ~Q3 2026; Auth-Modell änderte
  sich (DCR → CIMD). Versionsbewusst implementieren, Capability-Negotiation strikt.
- **Twenty-Code ist AGPL-3.0** („contaminating") — **nur Architektur-Muster** übernehmen, keinen Code.
- **Salesforce-Vollparität ist mehrjährig** — bewusst „Kern-Ersatz" (~80 %); CPQ/Revenue Cloud, Field
  Service, Territory Management bewusst depriorisieren oder via Integration.
- **Embedded-DB-Reife:** LanceDB (Multi-Process-Concurrency limitiert), Kùzu (niedrigere Concurrency) — für
  Produktions-Skala pgvector/dedizierte DBs.
- **Framework-Wechsel ist teuer** — Harness-Entscheidung (A3) mit Bedacht.
- **Markdown vs. Metadaten-Modell:** A1 ist die folgenreichste Entscheidung — sie definiert, ob der
  local-first-Moat erhalten bleibt. Vor N1-Start final bestätigen.

---

## 8. Arbeitspakete (Backlog)

Jedes Paket ist eigenständig abarbeitbar: **Ziel · Deliverables · Akzeptanz (test-driven) ·
Abhängigkeiten · Aufwand (S/M/L) · Status**. Workflow je Paket: *research → plan → implement (TDD) →
optimize → document → commit*. Status-Legende: ✅ fertig · 🟡 in Arbeit · 🔲 offen.

### Status-Board (Übersicht)

| ID | Paket | Track | Aufwand | Status |
|---|---|---|---|---|
| SF-1 | Pagination Contacts/Tasks | Migration | S | ✅ |
| SF-2 | Opportunities → Pipeline | Migration | M | ✅ |
| SF-3 | Leads → Kunden | Migration | M | ✅ |
| SF-4 | Events → interactions | Migration | S | ✅ |
| SF-5 | Cases → Tickets | Migration | M | ✅ |
| SF-6 | Products/LineItems → Deal-Value/Quotes | Migration | M | ✅ |
| SF-7 | Notes → interactions | Migration | S | ✅ |
| SF-8 | Campaigns (✅) / Custom Fields (file-mode) / Owner / Hierarchie (deferred) | Migration | L | ✅ |
| N1-1 | MCP **Resources** (read-only Entities) | Core/MCP | M | ✅ |
| N1-2 | MCP **Prompts** (Playbooks) | Core/MCP | S | ✅ |
| N1-3 | **Elicitation** bei Pflichtfeldern | Core/MCP | S | 🔲 |
| N1-4 | **OAuth 2.1 Resource Server** (HTTP, token auth) | Security | L | ✅ |
| N1-5 | **Tool-Search / Lazy-Loading** | Core/MCP | M | 🔲 |
| N1-6 | **Registry-Listing** (`server.json`) | GTM | S | ✅ (Publish via OIDC = OPS) |
| N1-7 | **Metadaten-Datenmodell** (object/fieldMetadata, Runtime-Zod) | Core | L | 🟡 (Custom-Fields-Registry + `dxcrm fields` ✅; Runtime-Zod-Merge/Custom-Objects offen) |
| N2-1 | LLM-Opportunity-Scoring | Sales | M | 🔲 |
| N3-1 | Omni-Channel-Routing (skill/priority) | Service | M | 🔲 |
| N3-2 | Vektorisierte KB + Eskalation (transfer-to-human Action) | Service | M | 🔲 |
| N4-1 | Segmente/Listen | Marketing | M | ✅ (`dxcrm segment` + evaluateSegment) |
| N4-2 | Journeys (Branching) | Marketing | L | 🟡 (Engine: advance/branch + Storage; Enrollment-Runner/CLI offen) |
| N4-3 | CDP: Identity Resolution + Unified Profiles | Data | L | 🟡 (deterministische Dedup `dxcrm identity duplicates`; Unified Profiles + probabilistisch offen) |
| N5-1 | Custom Objects/Fields via Metadata-API (No-Migration) | Platform | L | ✅ (CRUD + `dxcrm object` CLI + 4 MCP-Tools) |
| N5-2 | Webhook-CRUD-Events (Backoff + Replay-Store) | Platform | M | ✅ (`dxcrm webhook` + emitEvent/retryFailures; create_record emittiert) |
| N5-3 | Sharing-Rules / Field-/Row-Level-Security | Platform | M | 🟡 (Field-ACL `redactFields` + buildContextBlock-Redaction; weitere Read-Pfade offen) |
| N6-1 | Bi-temporaler Wissensgraph (4 Zeitstempel/Edge) | Memory | L | 🟡 (Primitive ✅: validFrom/To+recordedAt/invalidatedAt, invalidateEdge/activeEdges; Auto-Invalidation widersprüchlicher Fakten + Kùzu offen) |
| N6-2 | Multi-Agent-Orchestrierung (Subagents/Handoffs) | Agentic | L | 🔲 |
| N6-3 | Command-Center-Observability (Containment/Accuracy) | Agentic | M | 🔲 |
| X-1 | PII-Masking vor LLM-Call | Compliance | M | ✅ (opt-in `DXCRM_PII_MASKING=on`) |
| X-2 | Guardrails (Prompt-Injection / Indirect-Injection) | Compliance | M | ✅ (opt-in `DXCRM_GUARDRAILS=on`) |
| REF-1 | Spark-Framework-Adapter | Refinement | S | ✅ (kein Stub im aktuellen Code) |
| REF-2 | Structured `ContextBlock` (neben string) | Refinement | S | ✅ |
| REF-3 | Coverage-Top-ups (`mcp/server.ts`, `sync/index.ts`) | Quality | S | 🔲 |
| OPS-1 | Go-Live npm (Repo public, Secrets, Pages, Release) | Ops | — | ⏸ user |
| OPS-2 | 8 alte `claude/*`-Branches löschen | Ops | — | ⏸ user |

---

### Track Migration (Salesforce-Vollexport)

**SF-4 · Events → interactions** — S
- **Ziel:** Salesforce-Kalenderevents als Meeting-Interactions importieren (heute nur Tasks).
- **Deliverables:** `SalesforceEvent` + `fetchSalesforceEvents()` (paginiert via `soqlQueryAll`, Felder Id, Subject, Description, ActivityDate/StartDateTime, WhoId, WhatId) in `salesforce-client.ts`; Pass 5 in `runSalesforceApiImport`; `sourceRef = salesforce://event/<id>`.
- **Akzeptanz:** Unit-Test Client (parse + Pagination); Import-Test: Event → `interactions.md` Typ `Meeting`, dedup, `eventsImported`-Counter.
- **Abhängig:** SF-1. **Status:** 🔲

**SF-5 · Cases → Tickets** — M
- **Ziel:** Salesforce-Cases ins Ticket-System überführen (Service-Cloud-Ersatz).
- **Deliverables:** `SalesforceCase` + `fetchSalesforceCases()` (Id, Subject, Description, Status, Priority, AccountId, ContactId, CreatedDate); Mapping SF-Status/Priority → opencrm-Ticket-Felder (inkl. SLA-Berechnung); schreibt via Ticket-Store (`create_ticket`-Pfad).
- **Akzeptanz:** Client-Test; Import-Test: Case → Ticket mit gemapptem Status/Priorität + SLA-Due, dedup `salesforce://case/<id>`, `casesImported`-Counter.
- **Abhängig:** SF-1; Ticket-Store-API. **Status:** 🔲

**SF-6 · Products/OpportunityLineItem → Deal-Value/Quotes** — M
- **Ziel:** Deal-Ökonomie-Detail (Line Items) erhalten.
- **Deliverables:** `fetchSalesforceLineItems()` (OpportunityLineItem: Product2.Name, Quantity, UnitPrice, TotalPrice, OpportunityId); je Opportunity Line Items aggregieren → Deal-`value` verifizieren/setzen + optional `generate_quote`-kompatibles Quote-Artefakt.
- **Akzeptanz:** Client-Test; Import-Test: Line Items summieren auf Deal-Value bzw. erzeugen Quote-Einträge.
- **Abhängig:** SF-2. **Status:** 🔲

**SF-7 · Notes → interactions** — S
- **Ziel:** Salesforce-Notes (ContentNote/Note) als Kontext-Interactions.
- **Deliverables:** `fetchSalesforceNotes()` (Title, Body/TextPreview, ParentId); Pass → `interactions.md` Typ `Note`, `salesforce://note/<id>`.
- **Akzeptanz:** Client-Test; Import-Test: Note → Note-Interaction, dedup, Counter.
- **Abhängig:** SF-1. **Status:** 🔲

**SF-8 · Campaigns / Custom Fields / Owner / Hierarchie** — L · **Status:** ✅ (Kern erledigt)
- ✅ **Campaigns**: `CampaignMember` (+ `Campaign.Name`) → Note-Interaction je Mitglied, ContactId/LeadId-Link, dedup `salesforce://campaignmember/<id>`, `campaignsImported`-Counter.
- 🟢 **Custom Fields**: im **File-Import** bereits über LLM-Spalten-Mapping (`mapCsvFields`) abgedeckt (beliebige `__c`-Spalten). API-Describe-basiertes Passthrough bewusst **deferred** (niedriger ROI ggü. N1-Track; benötigt Describe-API).
- ⏸ **Owner→Actor** & **Account-Hierarchie**: bewusst zurückgestellt (geringer Enterprise-Wert; Owner über vorhandenen `ownerMap`-Pfad nachrüstbar). Priorität zugunsten N1 (Resources/Prompts/OAuth) verschoben.

### Track N1 — Core & MCP-Vollausbau

**N1-1 · MCP Resources** — M · **Ziel:** Entities/Listen read-only als `crm://people/{id}`, `crm://customers`, `crm://pipeline/{slug}`, `crm://timeline/{slug}` (Resource-Templates, Icons-Metadaten). **Akzeptanz:** `resources/list` + `resources/read` liefern korrekte Records; Integrationstest mit gemocktem FS. **Abhängig:** — **Status:** 🔲

**N1-2 · MCP Prompts** — S · **Ziel:** Playbooks als MCP-Prompts („Deal-Risiko bewerten", „Follow-up entwerfen", „Account-Brief", „Pipeline nach Region"). **Akzeptanz:** `prompts/list` + `prompts/get` mit Argument-Schemas. **Status:** 🔲

**N1-3 · Elicitation** — S · **Ziel:** bei fehlenden Pflichtfeldern strukturiertes Schema statt Fehler (z. B. fehlende Stage in `update_deal`). **Akzeptanz:** Tool gibt Elicitation-Request statt Error; Test. **Abhängig:** SDK-Elicitation-Support. **Status:** 🔲

**N1-4 · OAuth 2.1 Resource Server** — L · **Status:** ✅
- ✅ Bearer-Token-Gate auf HTTP-`/mcp` (`src/mcp/auth.ts`): opt-in, sobald ein Token via `dxcrm mcp token --actor --role` provisioniert ist (oder `DXCRM_MCP_AUTH=required`); standardmäßig offen für lokalen/Firewall-Betrieb (`DXCRM_MCP_AUTH=off` erzwingt aus).
- ✅ RFC 9728 `/.well-known/oauth-protected-resource`; 401 + `WWW-Authenticate: Bearer resource_metadata=...`; Tokens nur SHA-256-gehasht, `timingSafeEqual`-Vergleich; Token-Actor → `DXCRM_ACTOR` für RBAC.
- 🔲 **Offen (später):** voller OAuth-Flow gegen externen Authorization Server (JWKS/JWT-Validierung, PKCE-S256, RFC 8707 Audience-Binding); per-Request-Actor statt Prozess-Env (verzahnt mit N5-3).

**N1-5 · Tool-Search / Lazy-Loading** — M · **Ziel:** Kontext-Überlauf bei 52+ Tools vermeiden. **Akzeptanz:** Tool-Discovery liefert relevante Teilmenge; Test. **Status:** 🔲

**N1-6 · Registry-Listing** — S · **Ziel:** `server.json` (Reverse-DNS-Namespace), Publish auf `registry.modelcontextprotocol.io` via `mcp-publisher` + GitHub-OIDC. **Akzeptanz:** valides `server.json`, CI-Step. **Abhängig:** OPS-1 (public). **Status:** 🔲

**N1-7 · Metadaten-Datenmodell** — L · **Ziel:** `object/fieldMetadata`-Äquivalent in `.agentic/schema/`, Composite-Typen, Runtime-Zod-Generierung, permission-aware Query-Layer (Architektur-Entscheidung A1). **Inkrementeller Pfad** (kein Big-Bang): (1) Custom-Field-Passthrough in `main_facts.md`-Frontmatter; (2) Metadaten-Registry + Runtime-Zod-Merge mit den 11 Basis-Schemas; (3) Custom-Objects. Nutzt das schon offene `properties: Record<string,unknown>` der Graph-Nodes als Vorbild. **Akzeptanz:** Custom-Field definierbar → Record validiert + lesbar ohne Code-Migration; Basis-Schemas bleiben rückwärtskompatibel; Tests. **Abhängig:** A1 bestätigt. **Status:** 🔲 *(Fundament für N5-1)*

### Track N2–N6 (Domänen)
Pakete N2-1, N3-1/2, N4-1/2/3, N5-1/2/3, N6-1/2/3 wie im Status-Board; Detail-Spezifikation jeweils
beim Start des Pakets (research-Schritt), Ziel/Akzeptanz aus §4 abgeleitet.

### Track Querschnitt / Refinement / Ops
- **X-1 PII-Masking** (M): Integrationspunkt ist `src/core/llm.ts` (`getClient()`/`callLlm`/`summarizeEmail`) — Masking-Pass vor jedem `messages.create`, Demaskierung der Response. **X-2 Guardrails** (M): Prompt-Injection/Toxizität in `llm.ts` + `input-guard.ts` erweitern (heute nur Längen/Typ/Byte-Limit). Beide **vor** N4/N6 verpflichtend (EU AI Act).
- **N6-1 ist ein Upgrade**, kein Greenfield: `graph.json`-Edges um 4 Zeitstempel + Edge-Invalidation erweitern (A2a); `relationship-health.ts`/`org-intelligence.ts` lesen weiter denselben Graphen.
- **N5-2 (Webhook-CRUD-Events)** baut auf vorhandenem `webhook-receiver.ts` (heute nur **inbound**) — zu ergänzen: **outbound** Events bei Create/Update/Delete + Backoff/Replay-Store.
- **N4-3 (CDP/Identity-Resolution)**: Seed vorhanden (`email-dedup.ts`, Domain-/Email-Kanonisierung) → zu ML-/regelbasierter Identity-Resolution + Unified Profiles ausbauen.
- **AES-256-GCM-Feldverschlüsselung existiert bereits** (`encryption.ts`) — kein eigenes Paket nötig, nur für sensible Felder/Tokens anwenden.
- **REF-1 Spark-Adapter**, **REF-2 ContextBlock**, **REF-3 Coverage** — jederzeit als Lückenfüller.
- **OPS-1/OPS-2** — user-seitig (GitHub-UI), siehe §C/§D im Verlauf; kein Agent-Zugriff in dieser Umgebung.

---

## 9. Empfohlene Reihenfolge (Now / Next / Later)
- **Now:** SF-4 → SF-7 (Migration fertig) · N1-1 + N1-2 (Resources/Prompts, hoher Hebel) · N1-4 (OAuth, Security)
- **Next:** N1-7 (Metadaten-Modell) → N5-1 (Custom Objects) · N6-1 (Memory-Graph-Prototyp) · X-1/X-2
- **Later:** N3/N4 (Service/Marketing/Data) · N6-2/3 (Multi-Agent/Command-Center) · N1-6 + GTM
