# PlanHubSpot.md — DatasynxOpenCRM als vollständiger HubSpot-Ersatz
**Autor:** Product Owner · **Stand:** 2026-05-29 · **Basis:** HubSpot Feature-Katalog 2025/2026

---

## Die Wette, die wir eingehen

HubSpot ist ein UI-First-Produkt mit einem AI-Wrapper. Wir sind ein Agent-First-Produkt mit einem UI-Wrapper (der noch kommt). Jede HubSpot-Feature-Kategorie, die sie mit Breeze-Credits monetarisieren, ist bei uns ein nativer MCP-Tool-Call — unlimitiert, auditierbar, git-versioniert, self-hosted.

Die Frage ist nicht "Was baut HubSpot, das wir auch bauen müssen?" sondern "Welches Ergebnis will der User?" Das Ergebnis ist: mehr Revenue, bessere Kundenbeziehungen, weniger manuelle Arbeit. Jedes Feature wird an diesem Maßstab gemessen.

---

## Was wir BEREITS haben (HubSpot-Parität, Stand heute)

### Smart CRM Basis (✅ vollständig)
| HubSpot Feature | Unser Äquivalent | Status |
|---|---|---|
| Kontakt-/Company-Datenbank | `main_facts.md` (YAML-Frontmatter) | ✅ |
| Custom Properties | Beliebige YAML-Felder in main_facts.md | ✅ |
| Deal Pipeline (visuell) | `pipeline.md` + `get_pipeline_stages` MCP | ✅ |
| Aktivitäten/Aufgaben | `interactions.md` + `log_interaction` MCP | ✅ |
| E-Mail-Tracking | Gmail Sync + Push Watch (Real-time) | ✅ |
| Import aus Tabellen | `dxcrm import` mit LLM-Field-Mapping | ✅ |
| Mobile (Außendienst) | CLI + MCP (jeder KI-Client auf iOS/Android) | ✅ |
| Unbegrenzte Kontaktspeicherung | Dateisystem, kein Limit | ✅ |

### Sales Hub (✅ Kern vorhanden)
| HubSpot Feature | Unser Äquivalent | Status |
|---|---|---|
| Deal-Pipelines (mehrere) | Pipeline-Stages konfigurierbar (`dxcrm pipeline-stages`) | ✅ |
| Deal-Tracking | `update_deal` MCP + pipeline.md | ✅ |
| Revenue-Forecasting | `simulate_revenue` (Monte Carlo p10/p50/p90) | ✅ |
| Angebots-Erstellung (Basic) | `export_customer` + Kontextaufbau | ✅ (partial) |
| Relationship Graph | `get_relationship_graph` + BFS-Pathfinding | ✅ |
| Warm-Intro-Paths | `warmIntroPaths` in graph.json | ✅ |
| Playbooks | `create_playbook` / `distill_playbook` / AI-generated | ✅ |
| Deal Health Scoring | `get_deal_health` (Wahrscheinlichkeit × Zeit × Risiko) | ✅ |
| Conversation Intelligence | `summarize_meeting` (Transcript → Interaction) | ✅ |
| Deal Room (Multi-Agent) | `open_deal_room` + `buildDealRoom` | ✅ |
| Lead Scoring | `get_relationship_health` (A–F Grade, Trend) | ✅ |
| Salesforce Integration | `salesforce-client.ts` | ✅ |

### Service Hub (✅ Basis vorhanden)
| HubSpot Feature | Unser Äquivalent | Status |
|---|---|---|
| Shared Inbox (intern) | interactions.md + MCP session | ✅ (partial) |
| Customer Health Score | `get_relationship_health` + health.json | ✅ |
| Customer Success Workspace | `open_deal_room` + health.json + `topPriorities` | ✅ |
| Book-of-Business Overview | `list_customers` + cross-customer context | ✅ |

### Data Hub (✅ weitgehend vorhanden)
| HubSpot Feature | Unser Äquivalent | Status |
|---|---|---|
| Gmail Sync (2-way) | `gmail-sync.ts` + Push Watch | ✅ |
| Google Drive Sync | `google-drive-sync.ts` | ✅ |
| Google Meet Sync | `google-meet-sync.ts` | ✅ |
| Microsoft 365 (Calendar, Teams) | `microsoft-sync.ts` + `microsoft-teams-transcripts.ts` | ✅ |
| Slack Integration | `slack-webhook-handler.ts` | ✅ |
| Pipedrive Import | `pipedrive-client.ts` | ✅ |
| Transcript Auto-Match | `transcript-watcher.ts` + LLM-matching | ✅ |
| Webhook Empfang | `webhook-receiver.ts` | ✅ |

### Breeze AI (✅ übertroffen)
| HubSpot Feature | Unser Äquivalent | Status |
|---|---|---|
| Breeze Assistant (Copilot) | Jeder MCP-Client (Claude, Codex, Cursor, …) | ✅ |
| Proactive Briefing Agent | `get_proactive_briefing` + Daily Daemon | ✅ |
| Deal Relationship Decay Alert | `relationship_decay_alert` (automatisch) | ✅ |
| Deal Risk Alert | `deal_risk_alert` (Closing < 7 Tage) | ✅ |
| Buyer Intent Signals | `external-signals.ts` (HN + Crunchbase) | ✅ |
| Contact Enrichment | Clearbit-Integration | ✅ |
| Revenue Simulation | Monte-Carlo 10.000 Iterationen | ✅ |
| Competitive Intelligence | `get_market_intelligence` | ✅ |
| Multi-Agent Deal Room | `open_deal_room` | ✅ |
| Notification Dispatch | Telegram + Slack (drainProactiveQueue) | ✅ |

### Enterprise Features (✅ bereits vorhanden — HubSpot Enterprise-Only)
| HubSpot Feature (Enterprise-Only) | Unser Äquivalent | Status |
|---|---|---|
| SSO / SAML | `src/core/sso.ts` | ✅ |
| RBAC (Role-Based Access Control) | `src/core/rbac.ts` | ✅ |
| Audit Log | `src/fs/audit-log.ts` | ✅ |
| Security Report | `dxcrm security-report` | ✅ |
| GDPR Erasure | `dxcrm gdpr delete-customer` | ✅ |
| Plugins (Erweiterungen) | `src/core/plugin-registry.ts` | ✅ |
| Push Notifications (Webhook/Telegram) | `src/sync/push-manager.ts` | ✅ |
| Encryption at Rest | `src/core/encryption.ts` | ✅ |
| Backup/Recovery | `dxcrm backup` + automatischer Daemon-Job | ✅ |
| Rate Limiting | `src/core/rate-limiter.ts` | ✅ |
| Input Guard (Injection Protection) | `src/core/input-guard.ts` | ✅ |

---

## GAPS: Was fehlt für vollständige HubSpot-Parität

### Priorisierungs-Framework (Product Owner Entscheid)

**Kriterien für Must-Have:**
1. Ist es ein primärer Grund, warum Teams HubSpot nicht verlassen?
2. Scheitert ein Use Case ohne dieses Feature?
3. Kann es unser Agent-Ansatz strukturell besser lösen?

**Kriterien für Out-of-Scope:**
1. Ist die Zielgruppe dafür eine andere Persona (B2C-Marketer, Web-Publisher)?
2. Gibt es Best-in-Class Open-Source-Alternativen, die wir integrieren?
3. Würde es uns vom Agent-First-Core ablenken?

---

## PHASE 2 — Sales Completion (Monate 1–2)
*Ziel: Jeder HubSpot Sales Hub Pro User kann sofort wechseln*

### H1 — Email Sequences Engine
**Warum Must-Have:** Sequences sind der #1 Retention-Grund für HubSpot Sales. Ohne automatisierte Follow-ups bleibt die Daily-Active-Usage niedrig.

**Was es ist:** Regelbasierte, zeitgesteuerte E-Mail-Serien mit personalisierten Variablen.
- Sequence-Definition als YAML in `.agentic/sequences/{name}.yaml`
- Felder: `steps[]` (delay_days, template_id, skip_if_replied)
- Daemon-Job prüft alle 6h, welche Contacts enrolled sind
- Proactive Agent enqueued `send_sequence_step`-Tasks → drainProactiveQueue dispatcht via Gmail-API
- MCP Tool: `enroll_in_sequence(slug, contactEmail, sequenceId)`
- MCP Tool: `list_sequence_enrollments(slug)`

**Technische Integration:**
```yaml
# .agentic/sequences/enterprise-outreach.yaml
name: Enterprise Outreach
steps:
  - day: 0
    template: initial-intro
    subject: "Quick question about {company}"
  - day: 3
    template: value-prop-followup
    skip_if_replied: true
  - day: 7
    template: case-study
    skip_if_replied: true
  - day: 14
    template: breakup
    skip_if_replied: true
```

### H2 — Email Templates Vault
**Warum Must-Have:** Sales-Teams arbeiten mit standardisierten Templates. Ohne Central-Store kein Team-Adoption.

- Templates als Markdown in `.agentic/templates/{category}/{name}.md`
- YAML-Frontmatter: subject, category, variables[]
- MCP Tools: `list_email_templates()`, `get_email_template(id)`, `draft_email(slug, templateId, variables)`
- AI-Assist: Variablen werden automatisch aus `main_facts.md` befüllt
- `dxcrm template create` / `list` / `preview`

### H3 — Meeting Scheduler Integration
**Warum Must-Have:** "Book a meeting" ist der wichtigste CTA im B2B-Vertrieb.

- Primär: Calendly API-Integration (existieren 80% der User schon)
- Sekundär: Cal.com (open source) als native Option
- MCP Tool: `get_booking_link(slug, type)` — gibt personalisierten Link zurück
- Auto-Logging: Calendly Webhook → `log_interaction` (Meeting gebucht)
- Config in `sources.json`: `"calendly": { "apiKey": "...", "eventTypes": {...} }`

### H4 — Quote & Invoice Generator
**Warum Must-Have:** Deals brauchen formale Angebote. Fehlende Quotes = Vertrieb schickt Word-Dokumente → Chaos.

- Quote-Template als Handlebars/Markdown in `.agentic/quote-template.md`
- Daten: Deal aus pipeline.md + Company aus main_facts.md
- Output: PDF (via `pdf-lib` oder Puppeteer) + Link an Kontakt
- MCP Tool: `generate_quote(slug, dealName, lineItems[])` → gibt PDF-Pfad zurück
- Tracking: Quote-View-Event via Pixel/Link-Redirect in `.agentic/quote-views.json`
- Später: E-Signatur-Integration (DocuSign API oder Adobe Sign)

### H5 — HubSpot Migration Importer
**Warum Must-Have:** Ohne "Import from HubSpot"-Knopf ist der Wechsel zu aufwändig. Das ist die größte Wechselhürde.

- HubSpot Export: Contacts CSV + Deals CSV + Companies CSV + Engagements CSV
- `dxcrm import --source hubspot --dir ./hs-export`
- LLM-Mapping (existiert bereits) auf HubSpot-Standard-Felder ausgerichtet
- Erkennt HubSpot Deal-Stages und mappt auf unsere Stages
- Pipeline-Entries werden aus Deals rekonstruiert
- Interactions aus Engagements CSV
- Deduplizierung über Domain/E-Mail

---

## PHASE 3 — Service Hub Parity (Monate 3–4)
*Ziel: Support-Teams können HubSpot Service ablösen*

### H6 — Ticket Management System
**Warum Must-Have:** B2B-Kunden wollen Support-Anfragen tracken, nicht nur Deals.

- Tickets als `tickets.md` im Customer-Folder (analog zu pipeline.md)
- Felder: id, title, status (open/in-progress/resolved/closed), priority, assignee, createdAt, sla_due
- MCP Tool: `create_ticket(slug, title, description, priority)`
- MCP Tool: `update_ticket(ticketId, updates)`
- MCP Tool: `list_tickets(slug?, status?, assignee?)`
- Daemon-Job: SLA-Breach-Erkennung → Alert via `relationship_decay_alert`-Queue
- Integration: Slack/Telegram bei neuem Ticket oder SLA-Breach

**Datenmodell:**
```markdown
# Tickets — Acme Corp

| ID | Title | Status | Priority | Assignee | Created | SLA Due |
|----|-------|--------|----------|----------|---------|---------|
| T-001 | API timeout issue | in-progress | high | alice | 2026-05-28 | 2026-05-29 |
```

### H7 — NPS / CSAT Survey Engine
**Warum Must-Have:** Customer Health ohne Feedback-Loop ist blind. NPS ist Standard in Enterprise-Accounts.

- Survey-Definition in `.agentic/surveys/{id}.yaml`
- Versand via Gmail-API (einmalig oder recurring)
- Response-Collection via eindeutigem Link → Webhook → `update_customer_facts`
- NPS-Score wird in health.json gespeichert und im `get_relationship_health` ausgegeben
- MCP Tool: `send_nps_survey(slug, contactEmail, surveyId)`
- Dashboard: Aggregierter NPS über alle Customers via `cross-customer.ts`

### H8 — Knowledge Base (Markdown-native)
**Warum Must-Have:** Enterprise-Support ohne KB = zu viel manuelle Arbeit, kein Self-Service.

**Unser Ansatz:** KB ist eine Sammlung von Markdown-Dateien in `.agentic/knowledge-base/` — sofort durchsuchbar für unseren AI-Agenten.
- `dxcrm kb create {article-slug}` → Markdown-Template
- `dxcrm kb search {query}` → LanceDB-Suche über KB-Artikel
- MCP Tool: `search_knowledge_base(query)` — nutzt gleiche Embeddings-Infra wie customer knowledge
- Optionaler Web-Publish: `dxcrm kb serve` → statisches HTML via `marked` + einfacher Express-Server
- AI-Assist: `create_kb_article_from_ticket(ticketId)` → Claude destilliert Lösung als KB-Artikel

---

## PHASE 4 — Marketing Hub Basics (Monate 5–6)
*Ziel: Marketing-Teams können grundlegende HubSpot-Marketing-Workflows ablösen*

**Product-Owner-Entscheid:** Wir bauen KEINEN Landing-Page-Builder und KEIN CMS. Das ist explizit Out-of-Scope. Integration mit Webflow, WordPress, Framer via Webhook ist der richtige Weg.

### H9 — Email Campaign Manager
**Warum Must-Have:** B2B-Teams brauchen Newsletter/Kampagnen-Versand an Segmente.

- Segment-Definition: Tag-basierte Filterung über alle `main_facts.md`
- Campaign-Config in `.agentic/campaigns/{id}.yaml`
- Versand via Gmail-API (kleine Teams) oder SMTP-Gateway (SendGrid, Mailgun) für größere Volumen
- Open/Click-Tracking via Pixel + Link-Redirect
- MCP Tool: `send_campaign(campaignId, segmentTags[])` → enqueued Tasks via proactive queue
- Unsubscribe-Handling: automatisches Tag `unsubscribed` auf Kontakt

### H10 — MQL-Scoring (Marketing Qualified Lead)
**Warum Must-Have:** Sales-Teams brauchen einen Signal, wann ein Lead "warm" ist — unabhängig vom Relationship-Health-Score.

- Separates Scoring-Modell von Relationship Health (die ist CS-orientiert)
- Kriterien: Email Opens, Link Clicks, Meeting Requests, Antwortrate
- Score: 0–100 pro Kontakt, in health.json gespeichert
- Threshold-Alert: MQL ≥ 70 → `relationship_decay_alert`-Queue mit type `mql_threshold_reached`
- MCP Tool: `get_mql_scores(slug)` → listet alle Kontakte mit MQL-Score

### H11 — Zapier / Make Connector (Bidirektional)
**Warum Must-Have:** 80% der SMB-Teams nutzen Zapier. Ohne Connector kein Ecosystem.

- REST API Endpoint (minimalst): `POST /api/v1/customers/{slug}/interactions` + `GET /api/v1/customers`
- API-Key Auth (simples Bearer Token in `.agentic/api-keys.json`)
- `dxcrm server start` → Express-Server mit REST + MCP über HTTP
- Zapier Trigger: "New Interaction logged" → Webhook-out via push-manager
- Zapier Action: "Log interaction" → POST zum REST-Endpoint
- Make-Modul: identisch

---

## PHASE 5 — Commerce Hub (Monate 6–7)
*Ziel: Quote-to-Cash ohne Salesforce CPQ*

### H12 — Stripe Payment Links Integration
**Warum Must-Have:** SaaS-Kunden wollen Payment direkt aus dem Deal-Flow.

- Stripe API-Key in `.agentic/integrations/stripe.json`
- MCP Tool: `create_payment_link(slug, dealName, amount, currency, recurring?)` → gibt Stripe-Payment-Link zurück
- Auto-Update: Stripe Webhook bei Zahlung → Deal-Stage auf "won" + `log_interaction` "Payment received"
- Subscription-Tracking: Stripe Subscription in pipeline.md als eigene Zeile (recurring = true)

### H13 — CPQ (Configure, Price, Quote)
**Warum Planned:** Erst nach H4 (Quote Generator) als Erweiterung.

- Product-Catalog in `.agentic/products.yaml` (Name, SKU, Preis, Menge)
- Quote-Builder: `generate_quote` bekommt Line-Items aus Catalog
- Discount-Logik: Approval-Workflow (wer darf >20% Rabatt genehmigen)
- MCP Tool: `configure_deal_pricing(slug, dealName, lineItems[], discount?)`

---

## PHASE 6 — Enterprise Platform (Monate 8–12)
*Ziel: 50+ User, multiple Teams, Governance, Compliance*

### H14 — REST API (vollständig)
**Warum Must-Have für Enterprise:** Enterprise-IT-Teams wollen API-first. MCP reicht nicht für System-Integrationen.

- OpenAPI 3.0 Spec (auto-generated aus Zod-Schemas)
- Endpoints: CRUD für Customers, Interactions, Deals, Tickets, Goals, Templates
- Auth: API Keys + OAuth2 + JWT
- Rate Limiting: bereits vorhanden (`rate-limiter.ts`)
- Versionierung: `/api/v1/` → `/api/v2/`
- SDK-Generation: TypeScript + Python SDK aus OpenAPI Spec

### H15 — Multi-Tenancy (Team Server)
**Warum Must-Have für Enterprise:** Teams von 10+ brauchen User-Isolation, zentrale Datenhaltung mit verteiltem Zugriff.

**Architektur:**
```
dxcrm-server (zentraler Node)
├── /tenants/{team-id}/customers/
├── /tenants/{team-id}/.agentic/
└── /api/v1/tenants/{team-id}/...
```
- User → Tenant-Mapping via SSO (bereits vorhanden)
- Daten-Isolation: jeder User sieht nur seinen Tenant
- RBAC per Tenant: Admin, Manager, Rep, View-Only
- Team-Session-Sharing: mehrere Reps können gleichzeitig auf selben Customer zugreifen

### H16 — Custom Objects (Schema-defined)
**Warum Must-Have für Enterprise:** Enterprise-CRMs brauchen domänenspezifische Objekte (Projekte, Produkte, Verträge, SLAs).

**Unser Ansatz:** Custom Objects sind Markdown-Dateien mit einem definierten Schema.
- Schema-Definition in `.agentic/custom-objects/{type}.schema.json`
- Instanzen in `customers/{slug}/objects/{type}/{id}.md`
- MCP Tool: `create_custom_object(slug, type, data)` / `query_custom_objects(slug, type, filter)`
- Automatische Zod-Schema-Generierung für Type Safety
- Suchbar via LanceDB (Custom Object Embeddings)
- Beispiele: Contract, Project, Product, SLA, Stakeholder, CompetitorMention

### H17 — Data Warehouse Integration
**Warum Planned für Enterprise:** Data-Teams brauchen HubSpot-Daten in Snowflake/BigQuery.

- Export-Daemon: täglicher Job, der alle Customers als Parquet/JSON exportiert
- Snowflake Integration: `src/sync/snowflake.ts` via Snowflake Node SDK
- BigQuery Integration: `src/sync/bigquery.ts` via @google-cloud/bigquery
- Schema: flach (customers_fact_table, interactions_table, deals_table, health_scores_table)
- Incremental: nur geänderte Dateien seit letztem Export (via `updated` YAML-Feld)

### H18 — Mobile PWA
**Warum Planned:** Field-Sales und Customer Success Manager brauchen mobilen Zugriff.

- Progressive Web App (Next.js oder SvelteKit + Tailwind)
- Features: Customers-Liste, Interaction-Log, Deal-Update, Proactive Briefing
- Offline-first: Service Worker cached Customer-Data lokal
- Push Notifications: Web Push API (Alternative zu Telegram/Slack)
- MCP-Backend: nutzt unsere bestehende MCP-Server-Infra via HTTP-Transport
- Auth: SSO/OAuth2

---

## AI-NATIVE FEATURES — Unser absoluter Differenziator

Diese Features hat HubSpot strukturell NICHT. Sie sind der Grund, warum Enterprise-Teams wechseln werden.

### A1 — AI SDR Agent (Prospecting)
HubSpot: "Breeze Prospecting Agent" (Credit-basiert, limitiert)
Unser Ansatz: Vollautonomer Agent mit unbegrenzten Runs.

- Konfiguration: ICP (Ideal Customer Profile) in `.agentic/icp.yaml`
- Agent durchsucht LinkedIn (via Browser-Automation), HN, Crunchbase
- Identifiziert potenzielle Kunden anhand ICP
- Erstellt Draft-Customer mit main_facts.md
- Verfasst personalisierten Outreach-Entwurf (kein Versand ohne Approval)
- MCP Tool: `run_prospecting_agent(icp)` → gibt Prospect-Liste zurück
- Human-in-the-Loop: `approve_agent_action` (bereits vorhanden)

### A2 — AI Customer Success Agent
HubSpot: "Breeze Customer Agent" (Enterprise, Credit-basiert)

- Liest health.json, interactions.md, tickets.md
- Identifiziert proaktiv Churn-Risiken
- Schlägt Interventionen vor (Call, Executive Sponsor Engagement, Discount)
- Erstellt QBR-Agendas (Quarterly Business Review)
- MCP Tool: `run_cs_agent(slug)` → gibt priorisierte Action-List zurück
- Automatisch: täglicher Daemon-Job für alle Customers mit Health < 40

### A3 — AI Deal Coach (Real-time)
*Kein HubSpot-Äquivalent — strukturell unmöglich für ein UI-First-Produkt*

- Während eines Calls (Transcript-Streaming): Echtzeit-Coaching
- "Konkurrent wurde erwähnt" → zeigt Battlecard
- "Preisobjection" → zeigt Playbook-Step
- "Decision Maker nicht im Call" → Hinweis auf Stakeholder-Lücke
- Implementierung: `summarize_meeting` + Echtzeit-Analyse via `distill_playbook`

### A4 — Multi-Deal AI Orchestration
*Kein HubSpot-Äquivalent — HubSpot ist ein Deal pro View*

- Ein Agent überwacht alle offenen Deals gleichzeitig
- Priorisiert: Welcher Deal braucht heute Aufmerksamkeit?
- Koordiniert: Identifiziert Cross-Sell-Opportunities über Kunden hinweg
- MCP Tool: `orchestrate_pipeline(priority: "revenue" | "risk" | "timing")` → gibt geordnete Deal-Liste zurück

### A5 — Autonomous Meeting Preparation
*HubSpot zeigt Daten — wir bereiten den Agenten vor*

- Trigger: Meeting-Event aus Calendar-Sync
- 30 Minuten vorher: Agent liest alle Kontext-Dateien
- Output: personalisiertes Brief-Dokument (Deal-Stand, letzte Interactions, Stakeholder-Map, Risiken, Gesprächsziele)
- Delivery: Push-Notification via Telegram/Slack
- MCP Tool: `prepare_meeting_brief(slug, meetingId)` → gibt strukturiertes Dokument zurück

### A6 — Competitive Intelligence Agent
- Monitort HN, LinkedIn, Twitter/X nach Erwähnungen von Kunden/Konkurrenten
- Alert wenn: Konkurrent verliert Kunden, funding event, neue Produktankündigung
- MCP Tool: `get_competitive_alerts(competitors[])` → gibt sortierte Alert-Liste zurück
- Automatisch: täglicher Check im proactive-worker

---

## Explicit Out-of-Scope (Product-Owner-Entscheid)

Diese HubSpot-Features bauen wir NICHT — aus strategischen Gründen:

| Feature | Warum Out-of-Scope | Alternative |
|---|---|---|
| Website Builder / CMS | Andere Persona (Web-Publisher). Webflow/WordPress machen das 10x besser. | Webhook-Integration mit Webflow |
| Blog-Management | Nicht CRM. Gehört in Content-Tools. | Ghost, WordPress Plugin |
| Social Media Publisher | Wir sind kein Social-Media-Tool. | Buffer, Hootsuite via Webhook |
| Podcast Hosting | Weit außerhalb unseres Cores. | Transistor, Buzzsprout |
| AI Image Generation | Kein CRM-Feature. | Midjourney-API als Plugin |
| SEO-Tool (nativ) | Out-of-scope, Nischen-Tool. | Ahrefs-Integration via Plugin |
| Landing Page Builder | Andere Persona. | Unbounce/Webflow-Integration |
| Commerce (native Payment Processing) | Regulatorisch komplex, zu weit vom Core. | Stripe direkt (H12) |
| HubSpot Ads-Integration | B2C-Feature, nicht B2B-CRM. | — |
| B2C-Features (Schülermarketing, Massen-Emails >100k) | Andere Zielgruppe. | Mailchimp |

---

## Technische Integrationsarchitektur (Enterprise Level)

```
┌─────────────────────────────────────────────────────────────────┐
│                    DatasynxOpenCRM Platform                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────┐  │
│  │  MCP Server   │  │   REST API    │  │   Daemon / Worker   │  │
│  │  (30+ tools)  │  │  (OpenAPI v1) │  │   (CronJobs)        │  │
│  └──────┬────────┘  └──────┬────────┘  └──────────┬──────────┘  │
│         │                  │                        │             │
│  ┌──────▼──────────────────▼────────────────────────▼─────────┐  │
│  │                    Core Business Logic                       │  │
│  │  context-builder · relationship-health · deal-health        │  │
│  │  revenue-simulation · goal-engine · proactive-agent         │  │
│  │  org-intelligence · graph · playbooks · notification        │  │
│  └───────────────────────────┬──────────────────────────────────┘  │
│                              │                                    │
│  ┌───────────────────────────▼──────────────────────────────────┐  │
│  │                   Data Layer (File-System)                    │  │
│  │  customers/{slug}/                                            │  │
│  │    main_facts.md  ·  interactions.md  ·  pipeline.md         │  │
│  │    health.json    ·  graph.json       ·  tickets.md          │  │
│  │    sources.json   ·  objects/{type}/  (Custom Objects)       │  │
│  │  .agentic/                                                    │  │
│  │    sequences/     ·  templates/       ·  campaigns/          │  │
│  │    knowledge-base/ · surveys/         ·  products.yaml       │  │
│  │    agent-queue.json · goals.json      ·  api-keys.json       │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Vector Search (LanceDB)                     │  │
│  │  Embeddings: Interactions, Playbooks, KB-Artikel, Objects     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│                    External Integrations                         │
│                                                                   │
│  Email    │ Productivity   │ Payments │ Enrichment │ Infra        │
│  ─────    │ ───────────    │ ──────── │ ─────────  │ ────         │
│  Gmail    │ Google Cal     │ Stripe   │ Clearbit   │ Telegram     │
│  SMTP     │ Google Drive   │          │ Crunchbase │ Slack        │
│  IMAP     │ Google Meet    │          │ HN Algolia │ Webhooks     │
│           │ MS Calendar    │          │            │              │
│           │ MS Teams       │          │            │              │
│           │ Calendly       │          │            │              │
│           │ Cal.com        │          │            │              │
│                                                                   │
│  CRM-Import: HubSpot CSV · Salesforce · Pipedrive               │
│  Data Warehouse: Snowflake · BigQuery (Phase 6)                  │
│  Workflow: Zapier · Make (via REST API, Phase 4)                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Gesamte Roadmap (Product Owner Commitment)

| Phase | Zeitraum | Features | Unlock |
|---|---|---|---|
| **✅ Phase 1** | Wochen 1–4 | Core CRM Loop (abgeschlossen) | Erster externer User |
| **✅ G1–G8** | Wochen 5–8 | Proactive Agent, Deal Room, External Signals | Daily Active Usage |
| **Phase 2** | Monate 1–2 | Email Sequences, Templates, Meeting Scheduler, Quote Generator, HubSpot Import | HubSpot Sales Pro Replacement |
| **Phase 3** | Monate 3–4 | Ticketing, NPS/CSAT, Knowledge Base, SLA Engine | HubSpot Service Replacement |
| **Phase 4** | Monate 5–6 | Email Campaigns, MQL-Scoring, Zapier/Make REST API | Marketing Basics + Ecosystem |
| **Phase 5** | Monate 6–7 | Stripe Integration, CPQ | Commerce Basics |
| **Phase 6** | Monate 8–12 | Full REST API, Multi-Tenancy, Custom Objects, Data Warehouse, Mobile PWA | Enterprise |
| **AI-Native** | Parallel | SDR Agent, CS Agent, Deal Coach, Meeting Prep | Unique Differentiator |

---

## KPI-Ziele nach Phasen

| Phase | Ziel-KPI | Definition |
|---|---|---|
| Phase 2 | 10 zahlende Teams | Teams mit >1 User, >5 Customers, daily Daemon aktiv |
| Phase 3 | 50 zahlende Teams | Service-Teams die aktiv Tickets via dxcrm managen |
| Phase 4 | 100 zahlende Teams | Erste Zapier-Integrationen live |
| Phase 6 | 10 Enterprise-Accounts (>50 User) | Multi-Tenancy + SSO + Custom Objects aktiv |

---

## Preisstrategie (Open Source → Enterprise)

| Tier | Preis | Zielgruppe | Was enthalten |
|---|---|---|---|
| **Community** | Free | Solo-Entwickler, Open-Source-Projekte | CLI + MCP (lokal) |
| **Team** | ~29 $/Monat | 2–10 User | + REST API + Calendly + Stripe + Email-Sequences |
| **Professional** | ~99 $/Monat | 10–50 User | + Multi-Tenancy + NPS + Ticketing + Campaigns |
| **Enterprise** | Custom | 50+ User | + Custom Objects + Data Warehouse + SLA + SSO + Support |

**Open Source Versprechen:** Core bleibt MIT. Alle Integrationen (Gmail, Calendly, Stripe) bleiben open. Enterprise-Features (Multi-Tenancy, Data Warehouse, SLA-Engine) werden als kommerzielle Add-ons geliefert — aber der Code ist lesbar.

---

## Die 3 entscheidenden Differenziator-Momente (vs. HubSpot)

### Moment 1: "Ich habe kein Budget-Meeting mehr vorbereitet"
Der Agent bereitet 30 Minuten vor dem Call automatisch ein personalisiertes Brief vor. HubSpot zeigt Daten. Wir bereiten den Menschen vor.

### Moment 2: "Mein CRM hat mich angerufen"
Ein Proactive-Alert via Telegram: "Alice bei Acme hat seit 28 Tagen nicht geantwortet — letzter Deal war $80k." HubSpot sendet Report-E-Mails. Wir senden einen kontext-reichen Alert genau dann, wenn Handlungsbedarf besteht.

### Moment 3: "Mein CRM gibt mir Geld zurück"
Revenue Simulation (p10/p50/p90) plus Closing-Date-Warnung plus MQL-Scoring = das System sagt dem Rep: "Fokussiere heute auf Deal X, nicht Deal Y." HubSpot zeigt Wahrscheinlichkeiten. Wir empfehlen Prioritäten.

---

*Letzte Änderung: 2026-05-29 — Product Owner*
