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

## 2. Wo wir heute stehen (ehrliche Bestandsaufnahme)

| Vision-Baustein (Whitepaper) | opencrm heute | Delta |
|---|---|---|
| Dual npm-Paket (MCP-Server + SDK) | ✅ `bin` + `exports` (`.` + `./mcp`), Dual ESM/CJS | Registry-Listing (`server.json`) fehlt |
| MCP-Server | ✅ 52 Tools, stdio **+** Streamable HTTP | nur **Tools** — **Resources** & **Prompts** fehlen |
| Auth | 🟡 HTTP-Server **ohne** Auth (Firewall-Modell) | **OAuth 2.1 Resource Server** (RFC 9728/8707, PKCE-S256) fehlt |
| Datenmodell | 🟡 **feste** Markdown-Schemas (main_facts/interactions/pipeline) | **metadaten-getrieben** (Custom Objects/Fields, Runtime-Typen) fehlt |
| Memory / Graph | 🟡 LanceDB-Vektorsuche + Relationship-Graph | **bi-temporaler** Wissensgraph (4 Zeitstempel/Edge, Graphiti-Muster) fehlt |
| Sales | ✅ Deals/Pipeline, Forecast, Deal-Health, Lead-Import, Activity-Capture (Gmail/MS) | Opportunity-Scoring teils heuristisch |
| Service | 🟡 Tickets (SLA, create/update/close) | Omni-Channel-Routing, vektorisierte KB-Eskalation |
| Marketing/Data | 🟡 Templates, Sequences, NPS | Journeys, CDP/Identity-Resolution, Segmente |
| Platform/Automation | 🟡 Proactive Worker, Playbooks, Goals, Push-Subscriptions | Custom Objects via Metadata-API, Webhook-CRUD-Events |
| Agent-Harness | 🟡 eigene Agents (deal-agent, proactive worker) | Andocken an Claude Agent SDK / Mastra / Hermes statt Eigenbau |
| Compliance | ✅ RBAC, Audit-Log, GDPR-Erase, security-report, local-first | PII-Masking vor LLM-Call, Guardrails, bi-temporale Auditierbarkeit |

**Kurz:** Der Sales-Kern + Compliance sind stark. Die drei großen Deltas sind **(1) metadaten-getriebenes
Datenmodell, (2) MCP-Resources/Prompts + OAuth 2.1, (3) bi-temporaler Memory-Graph.**

---

## 3. Strategische Architektur-Entscheidungen (zuerst zu klären)

**A1 — Datenmodell: Markdown bleibt Source-of-Truth, Metadaten-Layer obendrauf.**
Kein Postgres-Schema-pro-Workspace (würde local-first/Markdown-Moat brechen). Stattdessen:
ein `objectMetadata`/`fieldMetadata`-Äquivalent in `.agentic/schema/` (JSON), das **Custom Objects/Fields**
beschreibt; Records weiterhin als Markdown + Frontmatter; ein **Runtime-Typ-/Validierungs-Layer** (Zod aus
Metadaten generiert) und ein **permission-aware Query-Layer**. Composite-Feldtypen (ADDRESS/FULL_NAME/
CURRENCY/EMAILS/PHONES/LINKS) wie bei Twenty.

**A2 — Embedded Storage:** LanceDB (Vektoren, schon vorhanden) **+ Kùzu** (embedded Graph, Cypher,
file-basiert) für den bi-temporalen Graphen. Default zero-config; pgvector/Neo4j als Produktions-Pfad ab
Schwellen (>5 Mio Vektoren / hohe Concurrency).

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

## 8. Empfohlene Reihenfolge (Now / Next / Later)
- **Now:** Salesforce-Migration fertig (A1–A7 in `plan.md`) · MCP **Resources + Prompts** (schnell, hoher Hebel, baut auf 52 Tools) · **OAuth 2.1** (schließt B1-Security-Lücke)
- **Next:** Metadaten-Datenmodell (A1) + Custom Objects/Fields (N5-Kern) · bi-temporaler Memory-Graph-Prototyp (Kùzu)
- **Later:** Service-/Marketing-/Data-Vertiefung (N3/N4) · Multi-Agent-Orchestrierung & Command-Center (N6) · Registry-Publikation + GTM
