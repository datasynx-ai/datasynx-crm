---
date: 2026-06-11T00:00:00Z
researcher: majone
git_commit: b7a655a3c6581c20b1e30647f5e7973b9b12870e
branch: main
repository: datasynx/datasynx-crm
topic: "Issue #85 — deprecated dependencies, vulnerabilities, and package-tree optimization"
tags: [research, dependencies, package-json, exceljs, npm-audit, issue-85]
status: complete
last_updated: 2026-06-11
last_updated_by: majone
---

# Research: Issue #85 — Deprecated Dependencies, Vulnerabilities, and Package-Tree Optimization

**Date**: 2026-06-11
**Researcher**: majone
**Git Commit**: b7a655a3c6581c20b1e30647f5e7973b9b12870e
**Branch**: main
**Repository**: datasynx/datasynx-crm

## Research Question

GitHub issue #85 ("chore: Fix deprecated dependencies, vulnerabilities, and optimize package tree") requests a cleanup of the dependency tree. The issue raises five concerns: (1) `@datasynx/agentic-ai-cartography` is allegedly a direct dependency, (2) deprecated transitive packages, (3) npm audit vulnerabilities, (4) install/postinstall scripts, and (5) `lodash.isequal` usage. This research documents the **actual current state** of the dependency tree in this repository against each claim.

## Summary

The repository's manifest is [`package.json`](https://github.com/datasynx/datasynx-crm/blob/b7a655a3c6581c20b1e30647f5e7973b9b12870e/package.json), package name `@datasynx/agentic-crm@1.39.0`. Measured against the repo's installed tree (commit `b7a655a`, with `package-lock.json` present):

- **`@datasynx/agentic-ai-cartography` does not exist in this project.** It is absent from `package.json`, absent from `package-lock.json` (0 matches), and `npm ls @datasynx/agentic-ai-cartography` returns `(empty)`. The same is true for `@datasynx/agentic-ai-shadowing` (0 matches). The issue's `npm ls` snippet is headed `majone@ /home/majone` — it was captured from the **home directory's** package tree, not from this repository.
- **`npm audit` reports `found 0 vulnerabilities`** in this project — not the "3 moderate severity vulnerabilities" cited in the issue.
- **`uuid` is already at `11.1.1`**, not the deprecated `8.3.2` from the issue. This is the effect of the existing `overrides` block pinning `exceljs > uuid` to `^11.1.1`.
- **`lodash.isequal` is not used in source code.** It appears only as a transitive dependency of `exceljs`.
- The remaining deprecated transitive packages (`inflight`, `rimraf@2.7.1`, `glob@7.2.3`, `fstream`, `boolean`, `node-domexception`) **do exist** in the tree, and nearly all of them trace back to a single direct dependency: **`exceljs@4.4.0`**. Two others come from `@huggingface/transformers` and `google-auth-library`.

Net: the cartography claim and the audit/uuid claims do not reproduce against this repo; the deprecated-transitive-package claims do reproduce and are almost entirely rooted in `exceljs`.

## Detailed Findings

### 1. `@datasynx/agentic-ai-cartography` — not present in this repository

- Not listed in [`package.json` dependencies](https://github.com/datasynx/datasynx-crm/blob/b7a655a3c6581c20b1e30647f5e7973b9b12870e/package.json#L92-L120) or devDependencies.
- `grep -c "agentic-ai-cartography" package-lock.json` → `0`.
- `grep -c "agentic-ai-shadowing" package-lock.json` → `0`.
- `npm ls @datasynx/agentic-ai-cartography` → `@datasynx/agentic-crm@1.39.0 ... └── (empty)`.

The issue's reproduction block:
```
majone@ /home/majone
├── @datasynx/agentic-ai-cartography@0.9.0
└─┬ @datasynx/agentic-ai-shadowing@0.2.1
```
The `/home/majone` header indicates this tree belongs to the user's home directory (a separate `package.json`/global install scope), not to `/home/majone/Projects/datasynx-crm`.

### 2. npm audit — 0 vulnerabilities in this project

`npm audit` output for this repo: `found 0 vulnerabilities`. The issue's "3 moderate severity vulnerabilities" does not reproduce against the repo's `package-lock.json` at commit `b7a655a`.

### 3. `uuid` — already modernized via existing override

- Installed version: `uuid@11.1.1` (the issue references the deprecated `uuid@8.3.2`, which is not in the tree).
- Dependency path: `exceljs@4.4.0 → uuid@11.1.1`.
- This is driven by the already-present `overrides` block in [`package.json:169-173`](https://github.com/datasynx/datasynx-crm/blob/b7a655a3c6581c20b1e30647f5e7973b9b12870e/package.json#L169-L173):
  ```json
  "overrides": {
    "exceljs": {
      "uuid": "^11.1.1"
    }
  }
  ```
- The only `uuid` references in `src/` are unrelated field names, not the npm package:
  - `src/sync/calendly-webhook-handler.ts:21` — `scheduled_event_uuid?: string;`
  - `src/sync/calendly-webhook-handler.ts:64` — reads `payload.payload.scheduled_event_uuid`.

### 4. `lodash.isequal` — transitive only, no source usage

- `grep -rn "lodash" src/` → no matches. No source file imports or requires `lodash.isequal`.
- Dependency path: `exceljs@4.4.0 → fast-csv@4.3.6 → @fast-csv/format@4.3.5 → lodash.isequal@4.5.0`.
- Because there is no first-party usage, the issue's proposed swap to `node:util.isDeepStrictEqual` has no source-code target here; the package is pulled purely transitively.

### 5. Deprecated transitive packages — dependency chains (these DO reproduce)

All present in the installed tree. Roots:

| Package | Version | Root direct dependency | Chain |
|---|---|---|---|
| `glob` | `7.2.3` | `exceljs`, `license-checker` (dev) | see below |
| `inflight` | `1.0.6` | `exceljs`, `license-checker` (dev) | via `glob@7.2.3` |
| `rimraf` | `2.7.1` | `exceljs` | `exceljs → unzipper → fstream → rimraf` |
| `fstream` | `1.0.12` | `exceljs` | `exceljs → unzipper → fstream` |
| `boolean` | `3.2.0` | `@huggingface/transformers` | `transformers → onnxruntime-node → global-agent → boolean` |
| `node-domexception` | `1.0.0` | `google-auth-library` | `google-auth-library → gaxios → node-fetch → fetch-blob → node-domexception` |

Detailed `glob@7.2.3` / `inflight` chains:
```
exceljs@4.4.0
├── archiver@5.3.2
│   ├── archiver-utils@2.1.0 → glob@7.2.3 → inflight@1.0.6
│   └── zip-stream@4.1.1 → archiver-utils@3.0.4 → glob@7.2.3
└── unzipper@0.10.14 → fstream@1.0.12 → rimraf@2.7.1 → glob@7.2.3
license-checker@25.0.1 (devDependency)
└── read-installed@4.0.3 → read-package-json@2.1.2 → glob@7.2.3
```

A modern `glob@13.0.6` also coexists in the tree (pulled by a different branch), alongside the legacy `glob@7.2.3`.

No source files import `glob`, `rimraf`, or `inflight` directly — a recursive
`grep` for `require(...)`/`from "..."` statements importing any of those three
package names across `src/` returns no matches.

### 6. Install / lifecycle-script packages present in this project

Of the six packages the issue lists as running install/postinstall scripts, the ones actually present in this project's tree are:

| Package | Version | Present? | Direct root |
|---|---|---|---|
| `tesseract.js` | `7.0.0` | yes | direct dependency ([`package.json:115`](https://github.com/datasynx/datasynx-crm/blob/b7a655a3c6581c20b1e30647f5e7973b9b12870e/package.json#L115)) |
| `onnxruntime-node` | `1.24.3` | yes | via `@huggingface/transformers` |
| `sharp` | `0.34.5` | yes | transitive |
| `protobufjs` | `7.6.2` | yes | transitive |
| `better-sqlite3` | — | **absent** | not in tree |
| `@datasynx/agentic-ai-cartography` | — | **absent** | not in tree (see §1) |

`better-sqlite3` and `agentic-ai-cartography` — two of the six install-script packages named in the issue — are not installed in this repository.

## Code References

- `package.json:92-120` — direct runtime dependencies (note `exceljs@4.4.0` at line 107, `tesseract.js@7.0.0` at line 115).
- `package.json:133-164` — devDependencies (includes `license-checker@25.0.1`, a secondary source of `glob@7.2.3`).
- `package.json:169-173` — existing `overrides` block pinning `exceljs > uuid` to `^11.1.1`.
- `src/sync/calendly-webhook-handler.ts:21,64` — the only `uuid`-string references in source (a Calendly field name, not the npm package).

## Architecture Documentation

- **Dependency-override pattern already in use.** The repo already demonstrates the issue's "use `overrides` to force-update a vulnerable sub-dependency" technique, applied to `exceljs > uuid`. Any further forced upgrades would extend this same `overrides` block in `package.json`.
- **`exceljs@4.4.0` is the dominant source of legacy transitive packages.** `glob@7.2.3`, `inflight`, `rimraf`, `fstream`, and `lodash.isequal` all originate (wholly or primarily) from the `exceljs` subtree via `archiver`, `unzipper`, and `fast-csv`.
- **Native-binary / script-running dependencies** in this project are `tesseract.js` (OCR), `onnxruntime-node` + `sharp` (via `@huggingface/transformers` for embeddings), and `protobufjs`. These align with the CRM's document-processing and local-embeddings features.
- **Lockfile present.** `package-lock.json` (~589 KB) exists at the repo root, so the `npm ls` / `npm audit` results above reflect a deterministic, committed tree.

## Historical Context (from thoughts/)

No `thoughts/` directory existed prior to this research; this is the first document under `thoughts/shared/research/`. No prior research notes on the dependency tree were found.

## Related Research

None found (first research document in this repository).

## Open Questions

These are observations the research surfaced but did not (and per scope, should not) resolve — they are documentation of where the issue's claims diverge from the repo's state, not recommendations:

- The issue's evidence for `agentic-ai-cartography`, the 3 moderate vulnerabilities, and `uuid@8.3.2` was captured against the `/home/majone` home-directory tree, not this repository. Whether the issue intends those to apply to the repo is unclear.
- Both `glob@7.2.3` (legacy) and `glob@13.0.6` (modern) coexist; documenting which consumers require each was partially traced (legacy → `exceljs`/`license-checker`; modern → a separate branch).
