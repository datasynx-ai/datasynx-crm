# Implementierungsplan — Hybrid-Search, Retrieval-Context & Interactions-Archivierung

> **Basis:** `docs/research/interactions-storage-and-hybrid-search.md` (Status-Quo-Analyse).
> **Verifiziert durch:** Code-Analyse (`lancedb.ts`, `hybrid-search.ts`, `ask.ts`, `context-builder.ts`, Tests) + Web-Recherche zur exakten LanceDB-Node-API (v0.29.0 installiert).
> **Datum:** 2026-06-05 · **Branch:** `claude/cool-cannon-WHui3`

---

## Leitentscheidung

**Hybrid wird selbst fusioniert, nicht an LanceDBs Reranker-Modul delegiert.** Begründung: In `@lancedb/lancedb@0.29.0` ist das `rerankers`-dist-Modul leer (kein nutzbarer JS-RRF-Reranker). Wir nutzen daher LanceDBs **native FTS (Tantivy/BM25)** und **native Vektorsuche** als zwei getrennte Queries und fusionieren ihre Ränge mit unserer **bereits getesteten** `reciprocalRankFusion` (`src/core/hybrid-search.ts`). Vorteile:
- Echtes BM25 (statt des bisherigen Term-Overlap-Zählers) für die Keyword-Seite.
- Volle Kontrolle + Testbarkeit, kein Abhängen von undokumentierten Reranker-Interna.
- Graceful Degradation: fehlt der FTS-Index (Altbestände) oder schlägt FTS fehl → Fallback auf reine Vektorsuche (heutiges Verhalten). **Nie** ein harter Fehler.
- Wiederverwendung von vorhandenem, getestetem Code (RRF, k=60).

**Verifizierte API (v0.29.0):**
- FTS-Index: `await table.createIndex("text", { config: Index.fts() })`
- FTS-Query: `table.search(query, "fts").limit(n).toArray()` → Rows mit `_score`
- Vektor-Query: `table.search(vector).limit(n).toArray()` → Rows mit `_distance`
- FTS erfordert einen **vorab erstellten** Index auf der `text`-Spalte.

---

## Schritt 1 — Echtes Hybrid in `search_customer_knowledge` (höchster ROI) ✅ ZUERST

**Ziel:** `searchKnowledge` liefert echtes Hybrid (Vektor + BM25, RRF-fusioniert). Tool-Beschreibung wird damit faktisch wahr.

**Dateien:**
- `src/core/lancedb.ts`
  - `getOrCreateCustomerTable`: nach Tabellen-Erstellung zusätzlich FTS-Index anlegen:
    `await table.createIndex("text", { config: Index.fts() })`.
  - **Neu** `ensureFtsIndex(table)`: legt FTS-Index auf `text` an, falls fehlend; Fehler „already exists" schlucken. Wird in `getOrCreateCustomerTable` und vor FTS-Suche opportunistisch genutzt (Migration für Altbestände).
  - **Neu** `ftsSearch(table, query, limit)`: `table.search(query, "fts").limit(limit).toArray()`, mappt zu `{source_ref, text, score=_score}`.
  - `searchKnowledge`: führt **beide** Queries (Vektor + FTS), bildet zwei Ranglisten von `source_ref`, fusioniert mit `reciprocalRankFusion([vecRanks, ftsRanks])`, dedupliziert auf Content, schneidet auf `limit`. Bei FTS-Fehler → nur Vektor (Fallback). Rückgabe-Shape bleibt `{content, score, source}` (rückwärtskompatibel).
- `src/mcp/tools/search-customer-knowledge.ts`: Beschreibung präzisieren (real „Hybrid: vector ANN + BM25 full-text, RRF-fused"); keine Schema-Änderung.
- `src/mcp/capabilities.ts` / `get_capabilities`: Beschreibungstext synchronisieren (CLAUDE.md-Regel Doku↔Code).

**Tests (TDD, `__tests__/core/lancedb.test.ts` erweitern):**
- FTS + Vektor liefern überlappende & disjunkte `source_ref` → RRF-Reihenfolge korrekt, Top-`limit` eingehalten.
- FTS-Query wirft (kein Index) → Fallback liefert reine Vektor-Resultate (heutiger Test bleibt grün).
- Dedupe: gleicher `source_ref` aus beiden Legs erscheint einmal.
- Mock-Stil wie bestehend (`vi.mock("@lancedb/lancedb")`, Query-Chain mit `search(query,"fts")`).

**Migration:** `ensureFtsIndex` macht den Index lazy für bestehende `docs_<slug>`-Tabellen. Zusätzlich optionaler Befehl in Schritt 4 (`dxcrm reindex`). Vorab `dxcrm backup`.

**Akzeptanz:** Suche nach exaktem Begriff/ID (z.B. Rechnungsnummer) findet den Treffer, den reine Vektorsuche verfehlt; semantische Query funktioniert weiter; `npm test` grün.

---

## Schritt 2 — `ask_crm` auf gemeinsame Hybrid-Basis

**Ziel:** „Ask your CRM" nutzt echtes Hybrid statt effektiv Keyword-only.

**Dateien:**
- `src/core/ask.ts`: für `slug`-gebundene Fragen die LanceDB-Hybrid-Resultate (Schritt 1) als interactions-Quelle nutzen; Memories/SOPs/Pipeline bleiben In-Memory-Korpus, aber `hybridSearch` wird **mit** `vectorRanking` aufgerufen (oder die Korpora in RRF korrekt fusioniert). Kein Vollscan der Markdown-Datei je Query mehr für interactions.
- `src/core/hybrid-search.ts`: bleibt für kleine In-Memory-Korpora (SOP/Memory); Aufrufer müssen `vectorRanking` befüllen (sonst Keyword-only — als bewusster Fallback dokumentieren).

**Tests:** `__tests__/core/ask.test.ts` erweitern: gemischte Quelle (interactions via LanceDB-Mock + memories) → relevante Quelle wird gefunden.

**Akzeptanz:** Frage mit exaktem Term über interactions liefert den Treffer; LLM-Antwort zitiert Quellen.

---

## Schritt 3 — Retrieval-augmentierter Context-Builder

**Ziel:** `get_customer_context` enthält neben den jüngsten Einträgen die **relevanten älteren** (per Hybrid).

**Dateien:**
- `src/core/context-builder.ts`: optionaler Parameter `focus?: string`/`query?: string`. Wenn gesetzt, zusätzlich Top-k (z.B. 3) Hybrid-Treffer aus LanceDB als Sektion „## Relevant History (retrieved)" anhängen — innerhalb des bestehenden Token-Budgets (3000) priorisiert. Ohne `focus` unverändert (Backwards-Compat).
- `src/mcp/tools/get-customer-context.ts`: optionales `focus`-Feld im Input-Schema durchreichen.

**Tests:** Context enthält retrievten älteren Eintrag bei gesetztem `focus`; Token-Budget eingehalten; ohne `focus` unverändert.

**Akzeptanz:** „Was war die Preisvereinbarung?" via `get_customer_context({slug, focus})` enthält den relevanten Alt-Eintrag, auch wenn er nicht unter den letzten 10 liegt.

---

## Schritt 4 — Interactions-Archivierung (jetzt risikofrei)

**Ziel:** `interactions.md` schlank halten, ohne Suchbarkeit zu verlieren (LanceDB bleibt vollständig).

**Dateien:**
- **Neu** `src/core/archive.ts`: `archiveInteractions(dataDir, slug, {before?, keep?})` — verschiebt kalte Einträge aus `interactions.md` nach `customers/<slug>/interactions-archive/<jahr>.md` (menschenlesbar, im Backup). **LanceDB unangetastet.** Optional rekursive Verdichtung kalter Einträge zu einem Summary-Block in `main_facts.md`.
- **Neu** `src/commands/archive.ts` + Registrierung: `dxcrm archive <slug> [--before YYYY-MM-DD] [--keep N]`.
- **Neu/optional** `dxcrm reindex [<slug>]`: stellt FTS-Index für bestehende Tabellen sicher (`ensureFtsIndex`) + re-embeddet ggf.
- `src/fs/interactions-writer.ts`: Reader für Archiv-Dateien (für vollständige Exporte / `export_customer`).
- F1-Backup-Scope: Archiv-Ordner ist unter `customers/` → automatisch erfasst.

**Tests:** Archivierung verschiebt korrekt (Datei-Round-Trip), `keep N` behält die jüngsten N, LanceDB-Suche findet archivierte Inhalte weiterhin.

**Akzeptanz:** `dxcrm archive acme-corp --keep 50` → `interactions.md` hat 50 Einträge, Rest in `interactions-archive/2026.md`; `search_customer_knowledge` findet archivierte Inhalte unverändert.

---

## Schritt 5 (optional, später) — Embedding-Upgrade

all-MiniLM-L6-v2 (384d) gegen modernes lokales Modell (bge-small, nomic-embed) mit kleiner Eval-Harness gegen echten Korpus evaluieren. Durch Hybrid (Schritt 1) sinkt der Druck. Nur mit Messung, kein Blind-Swap.

---

## Querschnitt: Doku & Governance

Pro Schritt (CLAUDE.md-Pflicht): README/`docs/` aktualisieren, `get_capabilities()`-Text synchronisieren, `npm test`/`build`/`typecheck`/`lint`/`format:check` grün vor jedem Commit. Vor Storage-Änderungen `dxcrm backup`.

## Reihenfolge & Auslieferung

Jeder Schritt ist eigenständig auslieferbar (eigener Commit/PR). **Reihenfolge nach ROI:** 1 → 2 → 3 → 4 → (5). Schritt 1 ist der größte Sofortgewinn und Voraussetzung für 2 & 3.

## Risiken

- **FTS-Index-Migration:** Altbestände brauchen den Index → `ensureFtsIndex` lazy + `dxcrm reindex`. Fallback verhindert harte Fehler.
- **local-first-Moat:** alles bleibt lokal/embedded; kein Cloud-Reranker im Default.
- **Backwards-Compat:** Rückgabe-Shapes & bestehende Tool-Schemas unverändert; neue Parameter optional.
