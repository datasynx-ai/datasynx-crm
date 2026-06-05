# Embeddings & Retrieval

DatasynxOpenCRM indexes every email, transcript and logged interaction into a
local, embedded vector store (LanceDB, one table per customer: `docs_<slug>`).
Search is **hybrid** — semantic vector similarity fused with BM25 full-text via
Reciprocal Rank Fusion — so both meaning ("pricing concerns") and exact terms
(invoice numbers, names) are covered. Everything runs locally; no data leaves
the machine.

## The embedding model

|               | Value                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Default model | `Xenova/all-MiniLM-L6-v2` (384 dimensions, ~25 MB, runs locally via `@huggingface/transformers`)                            |
| Override      | `DXCRM_EMBED_MODEL` environment variable                                                                                    |
| Dimension     | Detected automatically at runtime — the vector store sizes itself to the model, so 768-dim models work without code changes |
| Model cache   | `~/.cache/datasynx-opencrm/models` (override with `HF_CACHE_DIR`)                                                           |

The default is a small, proven model that keeps the install light and fully
offline. You can swap in a stronger local model (e.g. `Xenova/bge-small-en-v1.5`,
`Xenova/bge-base-en-v1.5`, or a nomic-embed build) — **but measure first.**

## Evaluating a model (measure before you switch)

Model choice should be data-driven, not a guess. Build a small fixtures file
with representative queries and their known-relevant documents:

```json
{
  "documents": [
    { "id": "d1", "text": "Discussed enterprise pricing at €5000/mo" },
    { "id": "d2", "text": "GDPR data residency must stay in the EU" },
    { "id": "d3", "text": "Weekly sync — no decisions" }
  ],
  "queries": [
    { "query": "what did we agree on pricing?", "relevantIds": ["d1"] },
    { "query": "data protection requirements", "relevantIds": ["d2"] }
  ]
}
```

Then evaluate the currently configured model:

```bash
dxcrm eval-embeddings ./fixtures.json --k 5
# recall@5: 100.0%
# MRR:        0.917
```

Compare a candidate model by setting the env var and re-running:

```bash
DXCRM_EMBED_MODEL=Xenova/bge-small-en-v1.5 dxcrm eval-embeddings ./fixtures.json --k 5
```

- **recall@k** — fraction of relevant documents found within the top _k_ results.
- **MRR** (mean reciprocal rank) — how high the first relevant result lands, averaged over queries.

Pick the model with the better numbers on _your_ corpus.

## Switching models on existing data

A new model usually produces a different vector dimension, so existing tables
must be rebuilt. After changing `DXCRM_EMBED_MODEL`, reindex each customer:

```bash
DXCRM_EMBED_MODEL=Xenova/bge-small-en-v1.5 dxcrm reindex acme-corp
```

`reindex` re-embeds rows **from the text already stored in the index** — no
re-sync of mailboxes or transcripts is needed. It also rebuilds the full-text
index, so it doubles as the migration for older tables created before hybrid
search existed.

## How it fits together

- **Indexing** (`src/core/lancedb.ts`, `src/core/chunk.ts`): content is chunked
  (~1500 chars, 150 overlap), embedded, and merge-inserted by `source_ref`.
- **Hybrid search** (`searchKnowledge`): vector ANN + BM25 FTS, fused with RRF;
  degrades gracefully to vector-only if no FTS index exists.
- **Consumers**: `search_customer_knowledge` (MCP), `ask_crm` (D10), and
  `get_customer_context({ focus })` all retrieve through this path. The Markdown
  files remain the human-readable source of truth; LanceDB is the retrieval index.
- **Archiving** (`dxcrm archive`): trims the hot `interactions.md` without
  touching the index, so archived content stays searchable.
