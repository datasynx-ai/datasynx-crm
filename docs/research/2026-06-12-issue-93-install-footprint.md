---
date: 2026-06-12T00:00:00Z
researcher: majone
git_commit: cd467ddcf8509e34d7ce636dac0fd7bbe87db29d
branch: main
repository: datasynx/datasynx-crm
topic: "Issue #93 — ~1 GB consumer install footprint (onnxruntime-web as suspected dead weight)"
tags: [research, dependencies, install-footprint, onnxruntime, huggingface-transformers, lancedb, packaging, issue-93]
status: complete
last_updated: 2026-06-12
last_updated_by: majone
---

# Research: Issue #93 — ~1 GB Consumer Install Footprint

**Date**: 2026-06-12
**Researcher**: majone
**Git Commit**: cd467ddcf8509e34d7ce636dac0fd7bbe87db29d
**Branch**: main
**Repository**: datasynx/datasynx-crm

## Research Question

Issue #93: a fresh `npm install @datasynx/agentic-crm` resolves ~353 packages, ~1 GB on disk. The lead is that `onnxruntime-web` (131 MB) is transitively pulled by `@huggingface/transformers` but appears unused on the Node path. Document the codebase as it exists today: where the heavy packages come from, how the embedding/ONNX backend is wired, what packaging/footprint controls already exist, and what is already documented.

This is a documentation map of the current state, not a remediation plan.

## Summary

- The four AI/native production stacks dominate the tree. In the dev install on this Linux x64 host they account for roughly **997 MB of a 1.5 GB `node_modules`**: `onnxruntime-node` (513 MB), `@lancedb/*` (276 MB across **both** gnu+musl variants), `onnxruntime-web` (131 MB), `tesseract.js-core` (44 MB), `@img`/libvips (33 MB).
- **`onnxruntime-web` has zero first-party imports.** It is pulled only transitively by `@huggingface/transformers@4.2.0`, which depends on both `onnxruntime-node` and `onnxruntime-web` simultaneously. No `src/` or `scripts/` code statically or dynamically imports it. `onnxruntime-node` is likewise never imported first-party — the only first-party touchpoint to the whole ONNX stack is `@huggingface/transformers` via `src/core/embedder.ts:1`.
- The transformers `env` object is configured in exactly **one place** (`src/core/embedder.ts:5-6`) and sets only `env.cacheDir`. There is **no** `env.backends`, device, or WASM-mode configuration — backend selection is left to library defaults.
- Packaging is already tightly controlled for what *ships* (the published tarball), via `files: [dist/, README.md, LICENSE]`, externalized heavy deps in `tsdown.config.ts`, and three guard scripts (sourcemaps, install-scripts, deprecated-deps). None of these controls touch the *consumer's transitive install tree*, which is where the 1 GB lives.
- The footprint is **already documented at a high level** in `docs/deployment.md:15-46` (native build table, ~25 MB model download, cache location). What is *not* in public docs: the total installed size (~1 GB), the per-package heavy-hitter breakdown, and the `onnxruntime-web` redundancy.

## Detailed Findings

### 1. Dependency provenance and on-disk sizes

Measured in the dev tree (`npm ls` + `du -sh`) at commit `cd467dd`. Total `node_modules`: **1.5 GB** (includes devDependencies).

**ONNX Runtime cluster — rooted at the direct prod dep `@huggingface/transformers@4.2.0`:**
```
@datasynx/agentic-crm → @huggingface/transformers@4.2.0 → onnxruntime-web@1.26.0-dev.20260416-b7804b056c
@datasynx/agentic-crm → @huggingface/transformers@4.2.0 → onnxruntime-node@1.24.3
```
Transformers depends on **both** runtimes; `onnxruntime-common@1.24.3` is also pulled.

| Package | Version | Size |
|---|---|---|
| onnxruntime-node | 1.24.3 | **513 MB** (largest single package) |
| onnxruntime-web | 1.26.0-dev.20260416 | **131 MB** |
| onnxruntime-common | 1.24.3 | 1.2 MB |
| @huggingface/transformers | 4.2.0 | 16 MB (own dir) |

**@lancedb — rooted at direct prod dep `@lancedb/lancedb@0.30.0`:**
Platform binaries are `optionalDependencies` of lancedb. On this host **both** `linux-x64-gnu` (147 MB) and `linux-x64-musl` (128 MB) installed → **276 MB total**. A single-libc consumer would only resolve one.

**tesseract — rooted at direct prod dep `tesseract.js@7.0.0`:** `tesseract.js-core@7.0.0` is **44 MB**.

**sharp / @img / libvips — rooted at `@huggingface/transformers@4.2.0` (NOT a direct dep):**
`sharp@0.34.5` is transitive via transformers; `@img/*` platform packages total **33 MB** (again both glibc and musl libvips variants present).

**Deprecated cluster (status in dev tree, for cross-reference with #92):**
- `boolean` — **absent** (eliminated by the `global-agent@^4` override).
- `rimraf` — **absent**.
- `global-agent` — present, overridden to 4.1.3 (256 KB). `onnxruntime-node` declares `global-agent@^3.0.0`; the root override forces 4.1.3.
- `glob@13.0.6` — **dev-only** (semantic-release / license-checker), not in the prod tree.
- `node-domexception@1.0.0` — present in **prod**, via `google-auth-library → gaxios → node-fetch@3 → fetch-blob@3`. An accepted residual.

> **Dev-tree vs consumer caveat:** `overrides` apply only at the install root, so a consumer's transitive resolution of `global-agent`/`rimraf`/`boolean` can differ from the dev tree shown here. That propagation gap is the subject of issue #92; it was *observed* but not re-verified in this session. A clean-room `npm pack` + prod-only install was **not** performed (sandbox node_modules is ephemeral). The issue #93 body's own figures (e.g. `@lancedb` 148 MB) are consistent with a single-libc consumer install, whereas this dev host shows 276 MB because both gnu+musl variants are present.

### 2. The embedding / ONNX backend wiring

- **Single backend entry point:** `src/core/embedder.ts:1` — `import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";`.
- **`env` configuration is one line:** `src/core/embedder.ts:5-6` sets `env.cacheDir` to `HF_CACHE_DIR` or `~/.cache/datasynx-opencrm/models`. There is **no** `env.backends`, `env.wasm`, device selection, or `env.allowRemoteModels` configuration anywhere in `src/`.
- **Model selection:** `DEFAULT_EMBED_MODEL = "Xenova/all-MiniLM-L6-v2"`, overridable via `DXCRM_EMBED_MODEL` (`src/core/embedder.ts:8-17`). The pipeline is lazily built on first use and rebuilt if the configured model changes (`EmbeddingPipeline.get()`, lines 23-32).
- **Dimension auto-detection:** `getEmbeddingDimension()` probes one embedding and caches the length (lines 66-72); `src/core/lancedb.ts:30-39` sizes the Arrow schema to that dimension.
- **Consumers of the embedder:** `src/core/lancedb.ts:6` (vector indexing + hybrid search), and `src/commands/eval-embeddings.ts:26` (dynamic import). LanceDB usage is entirely in `src/core/lancedb.ts` (connect, per-customer `docs_<slug>` tables, vector + FTS/BM25 legs fused by RRF).

**ONNX import audit (the core of #93's lead):**
- `onnxruntime-web` — **no first-party import** anywhere in `src/` or `scripts/`. All textual references are documentation/allowlist only: `CONTRIBUTING.md:17`, `scripts/check-install-scripts.ts:30` (the `protobufjs` postinstall note "via onnxruntime-web"), `docs/deployment.md:25`, and `package-lock.json`.
- `onnxruntime-node` — also **no first-party import**; only transitive via transformers. Referenced in comments/docs at `scripts/check-deprecated-deps.ts:15-18`, `scripts/check-install-scripts.ts:29`, `CONTRIBUTING.md:16`, `docs/deployment.md:24`.

### 3. Existing packaging / footprint controls

What these control is **what the package publishes**, not what the consumer's transitive tree resolves.

- **Publish scope:** `package.json:68-72` — `files: ["dist/", "README.md", "LICENSE"]`. No `.npmignore`. The `files` field is the sole inclusion control.
- **Externalized heavy deps (bundler):** `tsdown.config.ts` `external: ["@lancedb/lancedb", "apache-arrow", "@huggingface/transformers", "googleapis", "@napi-rs/canvas"]`. These remain `import`/`require` in the output and resolve at the consumer — they are deliberately *not* bundled. `sourcemap: false`.
- **Postbuild:** `scripts/postbuild.js` chmods `dist/cli.js` to 755 and creates canonical `index.d.ts`/`mcp.d.ts` aliases from tsdown's hashed dts filenames.
- **Guard scripts (offline, lockfile-only, CI-wired):**
  - `scripts/check-install-scripts.ts` — allowlist of packages permitted to run install scripts: `sharp`, `onnxruntime-node`, `protobufjs`, `tesseract.js`, `esbuild`, `fsevents` (#88). Runs in CI security stage and `npm run check:install-scripts`.
  - `scripts/check-no-sourcemaps.ts` — runs `npm pack --dry-run --json` and fails if any `.map` ships (#91). Source-level regression net for `tsdown sourcemap:false` + `tsconfig declarationMap:false`.
  - `scripts/check-deprecated-deps.ts` — denylist (`lodash.isequal`, `inflight`, `fstream`, `rimraf<4`, `glob<9`, `boolean`) read from the **dev** `package-lock.json`; `node-domexception` accepted residual. Note: per #92 this reads the dev lockfile, which does not model the consumer tree.
- **No `preinstall`/`postinstall`/`bundledDependencies`/`optionalDependencies`** in this package. `prepare: "husky"` is dev-only. Optional features are peer deps: `@napi-rs/canvas`, `express` (both `optional: true`).

### 4. What is already documented

- **`docs/deployment.md:15-46`** — "Install Footprint & Native Build Requirements": native-build table (`sharp`/libvips, `onnxruntime-node` "~tens of MB", `protobufjs`, `tesseract.js`), the ~25 MB default model downloaded on first use to `~/.cache/datasynx-opencrm/models` (override `HF_CACHE_DIR`), PDF-OCR opt-in, and self-hoster/CI notes. The table explicitly attributes `protobufjs` to "ONNX model loading (via `onnxruntime-web`)".
- **`docs/embeddings.md:10-21`** — model selection, ~25 MB size, cache location, "keeps the install light and fully offline", evaluation/switch workflow.
- **`README.md`** — hybrid memory / on-device LanceDB indexing (lines ~32, ~247-252); Node ≥ 20, self-hosted.
- **`CHANGELOG.md` / git history** — `eb65262` sourcemap exclusion (-66% unpacked tarball), `d3c4afa` boolean removal (#87), `210f644` install-script guard (#88), `77cd096` deprecated cluster removal (#85).

**Not currently in public docs (only in research notes):** total installed size (~1 GB / 353 packages), the heavy-hitter breakdown (onnxruntime-node 513 MB, @lancedb, onnxruntime-web 131 MB), the multi-libc variant duplication, and the `onnxruntime-web` redundancy on the Node path.

## Code References

- `src/core/embedder.ts:1` — sole first-party import of `@huggingface/transformers` (the entire ONNX stack hangs off this).
- `src/core/embedder.ts:5-6` — only `env` configuration (`env.cacheDir`); no backend/device/WASM config.
- `src/core/embedder.ts:8-17,23-32,66-72` — model selection, lazy pipeline, dimension probe.
- `src/core/lancedb.ts:6,30-39` — embedder consumer; Arrow schema sized to detected dimension.
- `src/commands/eval-embeddings.ts:26` — dynamic import of the embedder for recall@k/MRR eval.
- `package.json:99` — `@huggingface/transformers@4.2.0` (roots onnxruntime-web/-node + sharp/@img).
- `package.json:101,118` — `@lancedb/lancedb@0.30.0`, `tesseract.js@7.0.0` (direct heavy deps).
- `package.json:68-72` — publish `files` allowlist.
- `tsdown.config.ts` (`external`, `sourcemap:false`) — heavy deps externalized, not bundled.
- `scripts/check-install-scripts.ts:27-34` — install-script allowlist (lists onnxruntime-node + protobufjs "via onnxruntime-web").
- `scripts/check-no-sourcemaps.ts:35-41` — `npm pack --dry-run` map guard.
- `scripts/check-deprecated-deps.ts:46-56` — denylist + accepted residuals (reads dev lockfile).
- `docs/deployment.md:15-46` — current footprint documentation.

## Architecture Documentation

- **Lazy, single-backend embedding.** All embedding flows through one HF transformers pipeline, built on first use, cached to disk. The model weights are *not* in `node_modules` — they download to `~/.cache/datasynx-opencrm/models` at first use. The install weight is the **runtimes and native binaries**, not the model.
- **Heavy deps are externalized, not bundled.** The published `dist/` stays small (0.61 MB packed after #91); the 1 GB is entirely the consumer's transitive `node_modules` from externalized prod deps.
- **`@huggingface/transformers` is the single root** of the largest cluster: onnxruntime-node + onnxruntime-web + sharp/@img/libvips all descend from it. `@lancedb/lancedb` and `tesseract.js` are separately rooted direct deps.
- **Multi-platform native packages duplicate per libc** (lancedb gnu+musl, libvips glibc+musl) in this dev environment, inflating the dev-tree figure above a single-platform consumer install.
- **Supply-chain guards model the published package and the dev lockfile**, by design; they do not model the consumer's resolved transitive tree (explicitly noted as the #92 blind spot).

## Historical Context (from research notes)

- `docs/research/2026-06-11-issue-85-dependency-cleanup.md` — prior deprecated-dependency cleanup (exceljs/license-checker cluster removal).
- `docs/research/2026-06-11-issue-80-english-only-policy.md`, `docs/research/2026-06-11-issue-74-coverage-gaps.md` — sibling research docs (format reference).
- A `thoughts/shared/research/2026-06-12-install-footprint-embeddings-and-deps.md` and `thoughts/shared/research/2026-06-11-issue-87-88-supply-chain-dependency-hardening.md` also exist at the repo root with overlapping footprint analysis.

## Related Issues

- **#92** — npm `overrides` don't reach consumers; `check-deprecated-deps` models the dev lockfile, not the consumer tree. Same supply-chain surface, different facet.
- **#88** — install-script transparency allowlist (the guard that enumerates onnxruntime-node + protobufjs).
- **#91 (done)** — sourcemap exclusion from the published tarball (separate from install footprint).

## Open Questions

These are factual unknowns this read-only pass did not resolve (not recommendations):

1. **Is `onnxruntime-web` ever loaded at runtime through transformers' own internals** (not just first-party `src/` imports)? The audit confirms no first-party import; whether `@huggingface/transformers@4.2.0` itself `require`s it on the Node path was not traced into `node_modules`.
2. **What does a clean-room prod-only consumer install actually resolve** (size, package count, single vs multi-libc variants)? Not run this session — the dev-tree numbers include devDependencies and both libc variants.
3. **Whether `@huggingface/transformers@4.2.0` packaging offers any documented mechanism to exclude the web runtime** — not investigated (would require reading the upstream package manifest).
