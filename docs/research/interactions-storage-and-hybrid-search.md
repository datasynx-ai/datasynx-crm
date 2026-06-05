# Research & Code-Analyse — Interactions-Speicherung, Embeddings & Hybrid-Search

> **Status:** Analyse / Entscheidungsvorlage · **Datum:** 2026-06-05 · **Scope:** Storage-Layer für `interactions.md`, LanceDB-Indexierung, Such-Pfade, Context-Builder, Archivierung.
> **Ausgangsfrage (Lead):** „Das Markdown muss mit Embeddings in eine Datenbank für eine Hybrid-Search (Vektor + Keyword) — es kann nicht alles in einer Markdown-Datei liegen. Dazu die geplante Interactions-Archivierung."

---

## TL;DR (Bewertung der Hypothese)

Die Intuition ist **richtig und gut begründet** — aber die Hälfte davon existiert bereits, nur unvollständig verdrahtet:

1. **„Embeddings in eine DB"** → ✅ existiert. Jede Interaktion wird gechunkt, embedded (all-MiniLM-L6-v2, 384-dim) und in LanceDB pro Kunde (`docs_<slug>`) abgelegt. Die DB enthält bereits die **vollständige** Historie, nicht nur die letzten Einträge.
2. **„Hybrid-Search (Vektor + Keyword)"** → 🟡 **nur halb verdrahtet.** Es gibt ein Hybrid-Modul (RRF), aber der kundenseitige Such-Pfad (`search_customer_knowledge`) macht **reine Vektor-Suche**, und „Ask your CRM" macht effektiv **reine Keyword-Suche** (das Vektor-Ranking wird nicht übergeben). **Echtes** Hybrid (Vektor + Keyword fusioniert) wird auf keinem User-Pfad ausgeliefert.
3. **„Nicht alles in eine Markdown-Datei"** → ✅ korrekt als Skalierungsproblem. `interactions.md` wächst unbegrenzt und ist im **Hot Path** für Writes (Vollrewrite je Eintrag) und Context-Aufbau (Volldatei lesen + splitten je Query).

**Kernempfehlung:** Markdown bleibt **menschenlesbare Source-of-Truth + Append-Log** (das ist der local-first-Moat). Die **Retrieval-Substanz** wandert konsequent in LanceDB — inkl. **nativer Full-Text-Search (Tantivy) + nativem Hybrid-Search mit RRF-Reranker**, den das Node-SDK seit Längerem unterstützt. Die hand-gerollte JS-Keyword/RRF-Lösung wird dadurch abgelöst. Archivierung wird dann unkritisch, weil die Suche nicht mehr von der Markdown-Dateigröße abhängt.

---

## 1. Ist-Zustand (Code-Analyse)

### 1.1 Datenfluss heute

```
E-Mail / Transcript / Log
        │
        ├──▶ interactions.md            (Source of Truth, menschenlesbar, newest-first)
        │     src/fs/interactions-writer.ts  → appendInteraction()
        │
        └──▶ LanceDB  docs_<slug>       (Vektor-Index, gechunkt)
              src/core/lancedb.ts        → indexInLanceDB()
              src/core/chunk.ts          → chunkText(1500 chars, 150 overlap)
              src/core/embedder.ts       → embedText() all-MiniLM-L6-v2, 384-dim, normalisiert
```

**Zwei Lesepfade, die unterschiedlich funktionieren:**

| Pfad | Quelle | Was es liest | Such-Art |
|---|---|---|---|
| `buildContext()` / `get_customer_context` | `interactions.md` | **nur die letzten 10** Einträge (5 bei >3000 Tokens), rein chronologisch | **keine** Suche |
| `search_customer_knowledge` (MCP) | LanceDB `docs_<slug>` | gesamte Historie (gechunkt) | **reine Vektor-Suche** |
| `ask_crm` / „Ask your CRM" (D10) | In-Memory-Korpus (interactions+pipeline+memories+SOPs), je Query neu gelesen | gesamte Datei | **effektiv reine Keyword-Suche** |

### 1.2 Konkrete Befunde (mit Belegen)

**A) Indexierung ist sauber gechunkt — gut.**
`src/sync/gmail-sync.ts:177` chunkt `subject\nbody` und indexiert je Chunk mit kollisionsfreiem `source_ref` (`gmail://…#i`). Ebenso `email-ingest.ts:108`, `attachments.ts:101`. Die `mergeInsert("source_ref")`-Logik (`lancedb.ts:71`) ist damit idempotent pro Chunk.

**B) `search_customer_knowledge` ist NICHT hybrid — nur Vektor.**
`src/core/lancedb.ts:113` ruft `table.search(vector).limit(limit)` — eine reine ANN-Vektorsuche. Die Tool-Beschreibung in `src/mcp/tools/search-customer-knowledge.ts:51` behauptet jedoch *„Hybrid vector + full-text search"*. **Das ist faktisch falsch** (Doku/Verhalten driften auseinander). Bei exakten Begriffen, IDs, Eigennamen (genau die Stärke von Keyword/BM25) ist reine Vektorsuche schwächer.

**C) `ask_crm` übergibt kein Vektor-Ranking — effektiv Keyword-only.**
`src/core/ask.ts:46` ruft `hybridSearch(question, corpus, { limit: 6 })` **ohne** `vectorRanking`-Option. In `src/core/hybrid-search.ts:64` wird ohne `vectorRanking` nur das Keyword-Ranking in die RRF gegeben → die „Hybrid"-Suche kollabiert hier zu reinem Keyword-Matching. Zusätzlich wird der **gesamte** Korpus bei **jeder** Frage frisch von Platte gelesen und in-memory getokenized (`gatherCorpus`).

**D) Context-Builder nutzt kein Retrieval.**
`src/core/context-builder.ts:6` `MAX_INTERACTIONS = 10`; `parseRecentInteractions` nimmt die ersten N Einträge der Datei (newest-first). Es gibt **keinen** Vektor-/Hybrid-Abruf relevanter *älterer* Einträge in den Kontext. Frage „Was hatten wir vor 6 Monaten zu Preisen vereinbart?" über `get_customer_context` schlägt fehl, sofern es nicht unter den letzten 10 liegt — der Agent müsste separat `search_customer_knowledge` aufrufen.

**E) `interactions.md` ist im Hot Path und skaliert linear schlecht.**
`appendInteraction` (`interactions-writer.ts:76`) liest die **gesamte** Datei, prependet den neuen Eintrag und schreibt sie **komplett** neu (atomic). Bei hunderten Einträgen wird jeder Write O(Dateigröße); jeder Context-Aufbau liest+splittet die Volldatei; `ask_crm` liest+chunkt sie pro Query. Keine Rotation/Archivierung vorhanden (bestätigt: keine `archiveInteraction`/`rotate`-Funktion im Code).

**F) Hand-gerolltes Hybrid statt nativem LanceDB-FTS.**
`hybrid-search.ts` implementiert Keyword-Ranking (Term-Overlap, **kein** echtes BM25) + RRF in JS. LanceDB bietet das nativ und robuster (Tantivy-BM25 + RRF-Reranker) — die JS-Lösung ist redundant und schwächer (kein TF-IDF/BM25-Gewicht, kein Index, lädt Korpus in RAM).

### 1.3 Embedding-Stack

- Modell: `Xenova/all-MiniLM-L6-v2` via `@huggingface/transformers` (`embedder.ts`), **384 Dimensionen**, mean-pooling, normalisiert.
- Bewertung: solide, klein, lokal (passt zum local-first-Moat), aber ein älteres/kleines Modell. Für reine Vektorsuche begrenzt die Recall-Qualität; genau deshalb ist Hybrid (Keyword-Komplement) hier besonders wertvoll.

---

## 2. Die zwei Kernprobleme

1. **Hybrid wird versprochen, aber nicht geliefert.** Beide User-Pfade degenerieren zu *entweder* reiner Vektor- *oder* reiner Keyword-Suche. Das ist die größere, sofort behebbare Lücke (Trefferqualität + Korrektheit der Tool-Doku).
2. **Markdown ist Retrieval-Substrat UND Hot-Path-Datei.** Solange Context/Ask die Markdown-Datei direkt verarbeiten, koppelt die Performance an die Dateigröße — und Archivierung würde Daten *vor der Suche verstecken*. Erst wenn LanceDB die alleinige Retrieval-Quelle ist, wird Archivierung sicher und sinnvoll.

---

## 3. Research — Best Practices (2025/26)

### 3.1 LanceDB kann das nativ (auch im Node/TS-SDK)

- LanceDB unterstützt **native Full-Text-Search via Tantivy** und **Hybrid-Search** (`query_type="hybrid"`), die Vektor- und FTS-Query parallel ausführt und per Reranker fusioniert. Default-Reranker ist **RRF**; weitere (Cross-Encoder, Cohere) sind einsteckbar. ([LanceDB Hybrid Search](https://docs.lancedb.com/search/hybrid-search), [Native FTS Blog](https://www.lancedb.com/blog/feature-full-text-search))
- **Node/TypeScript** wird unterstützt: FTS-Index via `await table.createIndex("text", { config: lancedb.Index.fts() })`; bei String-Input sucht LanceDB automatisch auf dem FTS-Index, bei Vektor-Input auf dem ANN-Index; Boolean-/Phrase-Queries verfügbar. ([FTS Docs](https://docs.lancedb.com/search/full-text-search), [JS/TS API](https://lancedb.github.io/lancedb/js/globals/))

### 3.2 Warum Hybrid + RRF (statt nur Vektor)

- BM25/Keyword glänzt bei **exakten** Matches (IDs, Produktcodes, Eigennamen), wo Vektoren versagen; Vektoren glänzen bei semantischer Ähnlichkeit. Hybrid deckt beide Query-Typen ab. ([InfoQ: Why Vector Search Alone Isn't Enough](https://www.infoq.com/articles/vector-search-hybrid-retrieval-rag/))
- **RRF arbeitet auf Rängen statt Scores** und umgeht damit das Score-Normalisierungsproblem heterogener Scorer; **k=60** ist ein robuster Default. Übliches Muster: RRF als günstige erste Stufe, danach optional ein Cross-Encoder-Reranker auf die Top-N. ([Digital Applied: Hybrid Search Reference 2026](https://www.digitalapplied.com/blog/hybrid-search-bm25-vector-reranking-reference-2026), [RRF erklärt](https://glaforge.dev/posts/2026/02/10/advanced-rag-understanding-reciprocal-rank-fusion-in-hybrid-search/))
- **Konsistenz-Falle:** Ein Dokument im Vektor-Index, das im Keyword-Index fehlt, degradiert Hybrid-Recall still. → Beide Indizes müssen aus derselben Quelle befüllt werden (bei nativem LanceDB-FTS automatisch gegeben, da ein Index auf derselben Tabelle).

### 3.3 Archivierung / Tiered Memory für lange Historien

- Bewährtes Muster: **letzte 3–5 Einträge in voller Detailtiefe** + **Zusammenfassung älterer Abschnitte** + **explizit extrahierte Kern-Fakten** (Präferenzen, Entscheidungen). Ältere Einträge **zusammenfassen statt abschneiden** — Kern-Fakten müssen die Verdichtung überleben, Füllmaterial nicht. ([Strategies for Long Chat Histories](https://medium.com/@abdullahaliofc/effective-strategies-for-handling-long-chat-histories-in-rag-based-chatbots-2772a640da9c), [MachineLearningMastery: Memory in Agentic AI](https://machinelearningmastery.com/7-steps-to-mastering-memory-in-agentic-ai-systems/))
- Alle Turns werden für Retrieval embedded; in den Kontext kommen **selektiv nur die relevanten** (per Suche) plus die jüngsten. ([Towards Data Science: Practical Guide to Memory](https://towardsdatascience.com/a-practical-guide-to-memory-for-autonomous-llm-agents/), [Recursively Summarizing, arXiv 2308.15022](https://arxiv.org/pdf/2308.15022))

---

## 4. Empfohlene Zielarchitektur

**Prinzip:** Markdown = menschenlesbare SoT + Append-Log. LanceDB = einzige Retrieval-Quelle (Vektor **und** FTS auf einer Tabelle). Context = jüngste Einträge **+** retrievte relevante Einträge. Archiv = kalte Einträge aus dem Hot-File auslagern, **ohne** sie aus LanceDB zu entfernen.

```
                       ┌──────────────────────────────────────────┐
  Write (Email/…)  ──▶ │ interactions.md      (hot, newest-first)  │  menschenlesbar
                       │ interactions-archive/YYYY.md (cold)       │  archiviert, weiter lesbar
                       └──────────────────────────────────────────┘
                                        │  (gleiche Daten, gechunkt)
                                        ▼
                       ┌──────────────────────────────────────────┐
                       │ LanceDB docs_<slug>                       │
                       │  • vector (384d)  + FTS-Index (Tantivy)   │  EINZIGE Retrieval-Quelle
                       │  • native hybrid query + RRF reranker     │
                       └──────────────────────────────────────────┘
                            ▲                         ▲
            search_customer_knowledge          get_customer_context
            (echtes Hybrid)                    (jüngste N + retrievte relevante)
```

---

## 5. Konkreter Migrationsplan (gemappt auf den Code)

> Reihenfolge nach ROI; jeder Schritt ist für sich auslieferbar. Der local-first-Moat bleibt unangetastet (alles bleibt lokal/embedded).

**Schritt 1 — Echtes Hybrid in `search_customer_knowledge` (höchster ROI, kleinster Eingriff)**
- In `lancedb.ts`: bei `getOrCreateCustomerTable` zusätzlich `await table.createIndex("text", { config: Index.fts() })` anlegen; `searchKnowledge` auf nativen Hybrid-Query (Vektor + FTS, RRF-Reranker) umstellen.
- Damit wird die Tool-Beschreibung („Hybrid vector + full-text") endlich **wahr**. Bestehende Daten bleiben nutzbar (FTS-Index wird über `text`-Spalte gebaut).

**Schritt 2 — `ask_crm` auf LanceDB-Hybrid umstellen**
- `ask.ts` nicht mehr den gesamten Korpus pro Query in-memory lesen/tokenizen, sondern den LanceDB-Hybrid-Query nutzen (interactions/attachments liegen schon drin). Memories/SOPs können als eigene Tabellen oder weiter in-memory bleiben (klein), aber dann **mit** Vektor-Ranking in die RRF.
- `hybrid-search.ts` (hand-gerollt) wird damit für interactions obsolet; bleibt ggf. für kleine In-Memory-Korpora (SOP/Memory) bestehen — dann aber `vectorRanking` korrekt befüllen.

**Schritt 3 — Context-Builder retrieval-augmentiert**
- `buildContext`/`buildContextBlock`: optional eine `focus`/`query`-Eingabe; zusätzlich zu den letzten 10 Einträgen die Top-k relevanten älteren Einträge per Hybrid aus LanceDB ziehen und als „Relevante Historie" anhängen (Token-Budget bleibt erhalten).

**Schritt 4 — Interactions-Archivierung (jetzt sicher)**
- Neuer Befehl `dxcrm archive <slug> [--before YYYY-MM-DD] [--keep N]`: verschiebt kalte Einträge aus `interactions.md` nach `customers/<slug>/interactions-archive/<jahr>.md` (weiter menschenlesbar, weiter im Backup). **LanceDB bleibt unverändert** → kein Verlust an Suchbarkeit.
- Optional: rekursive **Verdichtung** alter Einträge zu einem „Summary"-Block in `main_facts.md` (Kern-Fakten überleben), Füllmaterial wandert ins Archiv.
- Writer-Optimierung: `appendInteraction` muss nicht mehr die ganze (jetzt kleine) Hot-Datei rewriten; bei sehr großen Altbeständen vorher archivieren.

**Schritt 5 (optional) — Embedding-Upgrade**
- all-MiniLM-L6-v2 (384d) gegen ein moderneres lokales Modell (z.B. bge-small/large, nomic-embed) evaluieren. Nur sinnvoll mit kleiner Eval-Harness gegen echten Korpus; durch Hybrid (Schritt 1) sinkt der Druck darauf.

---

## 6. Risiken & Trade-offs

- **Local-first-Moat zwingend wahren:** Alles bleibt lokal/embedded. Kein Cloud-Reranker (Cohere etc.) im Default-Pfad — RRF reicht und läuft offline.
- **Reindex-Bedarf:** Schritt 1 erfordert das Anlegen eines FTS-Index auf `docs_<slug>` (einmalig; `dxcrm reindex`-Migration einplanen).
- **Migrationssicherheit:** Vor Storage-Änderungen greift das vorhandene `dxcrm backup` (verschlüsselt, verifizierbar) — Round-Trip-Test vorab.
- **Doku-Drift schließen:** Tool-Beschreibungen (`search_customer_knowledge`, `get_capabilities`) müssen mit dem realen Verhalten synchronisiert werden (CLAUDE.md-Regel „Doku synchron zum Code").
- **`text`-Truncation:** `indexInLanceDB` speichert `text.slice(0, 2000)`; bei Phrase-FTS auf langen Chunks ggf. Limit prüfen (Chunks sind ohnehin ~1500 Zeichen, also meist unkritisch).

---

## 7. Fazit

Die vorgeschlagene Richtung ist korrekt: **Embeddings-in-DB für Hybrid-Search** ist die richtige Substanz — sie existiert im Kern bereits, ist aber **nicht zu echtem Hybrid verdrahtet**. Der größte schnelle Gewinn ist nicht Archivierung, sondern **Schritt 1**: `search_customer_knowledge` auf LanceDBs nativen Hybrid (Vektor + Tantivy-FTS + RRF) umstellen. Archivierung wird danach zur sauberen, risikofreien Aufräum-Maßnahme, weil die Suche entkoppelt von der Markdown-Dateigröße ist. Markdown bleibt der menschenlesbare, portable Source-of-Truth — der local-first-Moat bleibt erhalten.

---

## Quellen

- [Hybrid Search — LanceDB Docs](https://docs.lancedb.com/search/hybrid-search)
- [Full-Text Search (FTS) — LanceDB Docs](https://docs.lancedb.com/search/full-text-search)
- [Native Full-Text Search on 41M Wikipedia Docs — LanceDB Blog](https://www.lancedb.com/blog/feature-full-text-search)
- [LanceDB JS/TS API Reference](https://lancedb.github.io/lancedb/js/globals/)
- [Why Vector Search Alone Isn't Enough: Hybrid Retrieval for RAG — InfoQ](https://www.infoq.com/articles/vector-search-hybrid-retrieval-rag/)
- [Hybrid Search: BM25, Vector & Reranking Reference 2026 — Digital Applied](https://www.digitalapplied.com/blog/hybrid-search-bm25-vector-reranking-reference-2026)
- [Advanced RAG — Understanding Reciprocal Rank Fusion — glaforge.dev](https://glaforge.dev/posts/2026/02/10/advanced-rag-understanding-reciprocal-rank-fusion-in-hybrid-search/)
- [Effective Strategies for Handling Long Chat Histories in RAG — Medium](https://medium.com/@abdullahaliofc/effective-strategies-for-handling-long-chat-histories-in-rag-based-chatbots-2772a640da9c)
- [7 Steps to Mastering Memory in Agentic AI Systems — MachineLearningMastery](https://machinelearningmastery.com/7-steps-to-mastering-memory-in-agentic-ai-systems/)
- [A Practical Guide to Memory for Autonomous LLM Agents — Towards Data Science](https://towardsdatascience.com/a-practical-guide-to-memory-for-autonomous-llm-agents/)
- [Recursively Summarizing Enables Long-Term Dialogue Memory — arXiv 2308.15022](https://arxiv.org/pdf/2308.15022)
