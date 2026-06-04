# domino-plan.md — Die Domino-Sequenz (Hebel zuerst)

> **Prinzip:** Jeder Stein ist so gewählt, dass er **alle folgenden einfacher oder besser macht**.
> Erst Fundamente & Multiplikatoren (auf denen vieles aufbaut), dann Features, dann Härtung.
> **Sequenziert** das Backlog aus `Future-Feat.md` (F1–F8, C1–C8) gegen den Ist-Stand
> (`plan.md`/`next-plan.md` = bereits umgesetzt). Regel: nichts bauen, was die Agenten-Frameworks liefern.

```
WELLE 0 (Fundament)      D1 ─▶ D2 ─▶ D3 ─▶ D4
                         backup  hybrid  usage  approval
                            │      │       │      │
WELLE 1 (Multiplikatoren)   └─▶ D5 ─▶ D6 ─▶ D7 ─▶ D8
                                hygiene memories SOP  tonality
                                   │        │     │
WELLE 2 (Killer-Features)          └─▶ D9 ─▶ D10 ─▶ D11 ─▶ D12
                                       autofill ask-crm NBA   vault
WELLE 3 (Tiefe + Härtung)  D13 ─▶ D14 ─▶ D15 ─▶ D16 ─▶ D17
                           churn  scoring enrich conv-intel compliance
```

Jeder Stein: **Was er freischaltet/verbessert · hängt ab von · Quelle · Aufwand (S/M/L).**

---

## Welle 0 — Fundament (macht alles Folgende sicher, messbar, steuerbar)

### D1 ✅ · Backup-all + Restore-Drill — *macht jede weitere Iteration risikofrei* · F1 · S
- **Warum zuerst:** Billiges Sicherheitsnetz. Ein generisches, verschlüsseltes Backup über `customers/` **+**
  `.agentic/` erfasst automatisch **jeden später hinzukommenden Datentyp** (Memories, SOPs, Vault). Danach
  ist jedes Experiment reversibel → man baut mutiger und schneller.
- **Hängt ab von:** nichts (erweitert vorhandenes `dxcrm backup` + `encryption.ts`).
- **Schaltet frei:** fearless iteration für D2–D17.

### D2 ✅ · Hybrid-Search-Engine — *die Retrieval-Grundlage, auf der die meisten Features sitzen* · F8 · M
- **Warum jetzt:** Direkter Prerequisite für **Memories (D6), SOP (D7), Ask-your-CRM (D10), NBA (D11)**.
  Einmal gebaut (Vektor + Keyword + Rerank + Provenance), profitieren alle Retrieval-Features sofort.
- **Hängt ab von:** vorhandene LanceDB-Vektorsuche.
- **Schaltet frei:** D5, D6, D7, D10, D11.

### D3 ✅ · Token-Kosten/Observability am `callLlm`-Choke-Point — *jedes spätere LLM-Feature wird automatisch gemessen* · F7 · M
- **Warum jetzt:** Wird der eine LLM-Engpass **vor** den LLM-Features instrumentiert, sind alle folgenden
  Features „born observable" (Kosten je Kunde, Usage-Ledger) — kein Nachrüsten. Basis für Outcome-Pricing.
- **Hängt ab von:** `callLlm` (vorhanden); ergänzt `computeAuditMetrics`.
- **Schaltet frei:** Kostentransparenz + Pricing für D9–D16.

### D4 ✅ · HITL-/Approval-Gate + Autonomie-Policy — *jede spätere Automatisierung wird sicher & verkaufbar* · F3 · M
- **Warum jetzt:** Ein dünner Enforcement-Wrapper vor schreibenden Tools. Sobald er existiert, docken alle
  späteren agentischen Features (D9 Autofill, D5 Hygiene, D11 NBA) **kostenlos** an Freigaben an —
  zugleich EU-AI-Act-/Vertrauens-Argument.
- **Hängt ab von:** vorhandenes `approve_agent_action` + RBAC.
- **Schaltet frei:** sichere Schreib-/Automatisierungs-Features D5, D9, D11, D12.

---

## Welle 1 — Multiplikatoren (machen jede Interaktion klüger/konsistenter/besser)

### D5 ✅ · Daten-Hygiene-Agent (Fuzzy-Dedupe + Auto-Fix mit Approval) — *bessere Daten ⇒ jedes AI-Feature wird besser* · C5 · M
- **Warum hier:** ResearchCRM-Kernthese — „kein AI-Problem, ein Datenhygiene-Problem im AI-Kostüm". Saubere
  Daten heben **rückwirkend** die Qualität von Scoring, Memories, Suche, NBA. Nutzt D4 (Approval) + D2 (Fuzzy).
- **Hängt ab von:** D2, D4; vorhandenes `identity`-Dedup v1.
- **Schaltet frei:** verlässliche Grundlage für D9–D14.

### D6 ✅ · Memories je Kunde + global — *der Agent wird über alle Features hinweg dauerhaft klüger* · F4 · M
- **Warum hier:** Auf D2 gebaut; in `get_customer_context` injiziert → **jede** spätere Agenten-Interaktion
  (Autofill, NBA, Ask-CRM) profitiert automatisch von persistentem Wissen.
- **Hängt ab von:** D2.
- **Schaltet frei:** Kontext-Qualität für D9, D10, D11, D12.

### D7 ✅ · SOP-Modul + Trigger-Search — *Aufgaben werden konsistent nach Vorgaben erledigt* · F5 · M
- **Warum hier:** Prozedurales Wissen (global/je Kunde), per D2 auffindbar → liefert „wie machen wir X"
  an D9 (Autofill-Regeln), D11 (NBA), Human-Work.
- **Hängt ab von:** D2.
- **Schaltet frei:** prozessgetreue Ausführung in D9, D11.

### D8 ✅ · Tonalität je Kunde (+ global default) — *jede ausgehende Kommunikation wird besser* · F2 · S
- **Warum hier:** Klein, sofort wirksam; dockt an `draft_email`/Sequenzen/Journeys an → verbessert **alle**
  Kommunikations-Features auf einen Schlag.
- **Hängt ab von:** vorhandenes `draft_email({ tone })`.
- **Schaltet frei:** bessere Outputs in D9 + allen Outbound-Pfaden.

---

## Welle 2 — Killer-Features (höchster Nutzer-/Wettbewerbswert, jetzt entrisikt)

### D9 ✅ · Call/Meeting → CRM-Autofill — *löst den #1-Schmerz, ruht auf allen Fundamenten* · C1 · M
- **Warum hier:** Transkript → strukturierte Felder/Deal. Nutzt D2 (Kontext), D3 (Kosten), D4 (Approval),
  D6 (Memory), D7 (SOP-Regeln) — alles bereits da, daher de-risked und schnell.
- **Hängt ab von:** D2, D3, D4, D6, D7; vorhandener Transcript-Watcher/`summarize_meeting`.

### D10 ✅ · „Ask your CRM" (RAG-Chat / NL-Q&A) — *alle Daten konversationell zugänglich* · C2 · M
- **Hängt ab von:** D2 (+ D6 Memories, D7 SOPs). Macht Pipeline-/Win-Rate-/Kundenfragen sofort beantwortbar.

### D11 · Next-Best-Action-Engine — *macht jeden Deal-Schritt besser* · C3 · M
- **Hängt ab von:** D2 (ähnliche Deals), D6 (Memory), D7 (SOP), D4 (Approval).

### D12 · Vault + GUI (Credentials) — *macht Integrationen & Team-Deployments sicher* · F6 · L
- **Warum hier:** Sichere Geheimnis-Ablage (von D1-Backup verschlüsselt mit erfasst) ist Voraussetzung für
  externe API-Keys → schaltet **D15 Enrichment** und Integrationen frei. npm: kdbxweb (MIT) / @napi-rs/keyring (MIT).
- **Hängt ab von:** `encryption.ts`; wird durch D1 mitgesichert.
- **Schaltet frei:** D15.

---

## Welle 3 — Tiefe & Härtung (Wettbewerbstiefe, mit Governance)

### D13 · Churn-Frühwarnung — C4 · M — Hängt ab von D5 (saubere Signale), vorhandener relationship-health.
### D14 · Prädiktives ML-Lead-Scoring — C8 · M — Hängt ab von **D5** (saubere Trainingsdaten) + genügend Historie.
### D15 · Enrichment-Layer — C6 · M — Hängt ab von **D12** (Vault für API-Keys); pluginbar.
### D16 · Conversation-Intelligence-Lite — C7 · M — Talk-Ratio/Objections/Coaching aus Transkripten (D9-Pipeline).
### D17 · Compliance-Härtung + lokale-LLM-Option — §3 · M
- EU-AI-Act-Art.-50-Kennzeichnung über alle generierten Inhalte, `callLlm` provider-agnostisch
  (Anthropic | lokal/Ollama) als Datenschutz-Moat, DSGVO-Doku (DPIA/FRIA). Als **Querschnitts-Härtung am
  Ende**, weil es alle vorhandenen Features gleichzeitig betrifft (✅ `gdpr erase` bereits vorhanden).

---

## Warum genau diese Reihenfolge?

1. **D1–D4 sind Multiplikatoren, keine Features:** Sie kosten wenig und machen *alles danach* sicher (Backup),
   möglich (Hybrid-Search), messbar (Usage) und freigabefähig (Approval). Würde man sie spät bauen, müsste man
   jedes Feature nachrüsten.
2. **D5 (Datenhygiene) vor den AI-Features:** Saubere Daten heben rückwirkend jede spätere AI-Funktion —
   die am häufigsten unterschätzte Ursache gescheiterter agentic-Projekte.
3. **D6–D8 sind „smarter/konsistenter/schöner"-Schichten:** Memory, SOP und Tonalität verbessern jede
   Interaktion gleichzeitig, statt feature-einzeln.
4. **D9–D12 ernten den Wert**, jetzt auf stabilem Fundament (de-risked).
5. **D13–D17** sind Tiefe + Pflicht-Härtung, sinnvoll zuletzt, weil sie auf sauberen Daten (D5), Vault (D12)
   und der LLM-Pipeline aufsetzen.

**Abhängigkeits-Kurzform:** D2→{D6,D7,D10,D11} · D4→{D5,D9,D11} · D5→{D13,D14} · D12→{D15} · D3→Pricing(alle).

**Nicht in unser npm (Frameworks):** Agent-Loop/Reasoning, Voice/Realtime, LLM-Plumbing, Multi-Agent-Execution.
**Bewusst vermieden:** autonome Cold-Outbound-SDR-Bots (50–70 % Churn laut ResearchCRM).
