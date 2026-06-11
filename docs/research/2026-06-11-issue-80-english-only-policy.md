---
date: 2026-06-11T00:00:00Z
researcher: majone
git_commit: b8c97746ccbce04033a1a075155c72e64f9aeef3
branch: main
repository: datasynx/datasynx-crm
topic: "Enforce English-only across the codebase (GitHub issue #80)"
tags: [research, codebase, i18n, language-policy, ci, docs-check, deal-health, role-detection]
status: complete
last_updated: 2026-06-11
last_updated_by: majone
---

# Research: Enforce English-only across the codebase (GitHub issue #80)

**Date**: 2026-06-11T00:00:00Z
**Researcher**: majone
**Git Commit**: b8c97746ccbce04033a1a075155c72e64f9aeef3
**Branch**: main
**Repository**: datasynx/datasynx-crm

## Research Question

Document the current state of the codebase relevant to GitHub issue #80 — "Enforce English-only across the codebase (language policy)". Map where residual non-English (German) content lives in `src/`, tests, and `docs/`; how the existing `npm run docs:check` guard works (the model for a new language guard); and how the CI quality stage is structured.

## Summary

The repository's **public-facing surface is already English** (README, CHANGELOG, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, and 9 of 12 `docs/*.md` files). Residual German content exists in three distinct categories:

1. **Functional, behavior-significant German** — bilingual keyword/marker tables and one LLM output-language instruction in `src/core/`. These are not stray prose; they drive runtime detection (sentiment, stakeholder roles) and model output. Three files: `deal-health.ts`, `role-detection.ts`, `llm.ts`.
2. **German prose/comments and example phrases** — JSDoc examples and a code comment in `src/core/` (`role-detection.ts`, `graph-extractor.ts`).
3. **German documentation** — three internal docs are fully or predominantly German: `CLAUDE.md`, `docs/next-session-sop.md`, `docs/roadmap.md`. Test files contain mostly **German proper-name fixtures** (`Max Müller`, `Müller, Hans`) plus a handful of real German example strings.

The existing offline guard the issue points to is **`scripts/check-doc-links.ts`** (`npm run docs:check`), wired into the CI **`quality`** job in `.github/workflows/ci.yml`. No language/stopword guard exists today.

**Notable discrepancy with the issue text:** issue #80 states that `CLAUDE.md`, `docs/roadmap.md`, and `docs/next-session-sop.md` were "already translated to English (in the branch that introduced this policy)" and cites a `CLAUDE.md` → "Language Policy" section as the source of truth. On `main` at commit `b8c9774`, **none of that is true**: all three files are still German and there is no "Language Policy" section in `CLAUDE.md`. The policy branch has not been merged into `main`.

## Detailed Findings

### Category 1 — Functional German (drives runtime behavior)

These are the locations where German is part of the program's logic. Translating or removing them would change behavior, which collides with the issue's "no behavior change" constraint.

#### `src/core/deal-health.ts` — bilingual sentiment markers
The `NEGATIVE_MARKERS` and `POSITIVE_MARKERS` arrays are explicitly split into `// English` and `// German` blocks for bilingual sentiment detection over interaction text.
- `deal-health.ts:66-95` — `NEGATIVE_MARKERS`: English block (`:67-83`) then German block (`:84-95`): `bedenken`, `zu teuer`, `wettbewerb`, `konkurrenz`, `auf eis`, `verschieb`, `kein budget`, `kein interesse`, `einwand`, `storno`.
- `deal-health.ts:97-109` — `POSITIVE_MARKERS`: German entries `zugesagt`, `unterschrieben`, `genehmigt`, `begeistert` (`:105-108`) alongside English ones.

#### `src/core/role-detection.ts` — bilingual role regexes
Stakeholder-role detection regexes mix English and German alternatives in one pattern set. The JSDoc explicitly states "Keyword/phrase based (EN + DE)".
- `role-detection.ts:3-9` — JSDoc describing EN + DE detection (includes the German example phrase "CFO Thomas Berger äußert Budget-Bedenken").
- `role-detection.ts:17` — German alternatives inside the `economic_buyer` budget regex: `bedenken`, `verantwortung`.
- `role-detection.ts:23` — `economic_buyer`: `unterschreibt`, `freigabe`, `geschäftsführer`, `entscheider`.
- `role-detection.ts:31` — `champion`: `befürworter`, `treibt (das|den)`, `interner sponsor`.
- `role-detection.ts:38` — `blocker`: `blockiert`, `lehnt … ab`, `widerstand`, `skeptisch gegenüber`.

#### `src/core/llm.ts` — German output-language instruction
- `llm.ts:57` — system prompt instructs the model to return the `summary` field as "(2 sentences, German)". This is a behavior-affecting output-language directive embedded in the prompt string, not a comment.

### Category 2 — German prose / comments (behavior-neutral)

- `role-detection.ts:5` — JSDoc example phrase: "CFO Thomas Berger äußert Budget-Bedenken".
- `graph-extractor.ts:120` — code comment containing a German phrase ("…Budget-Bedenken").

### Category 3 — German in documentation

Sweep of all 19 markdown files (root + `docs/`, incl. `docs/research/`):

**Fully / predominantly German:**
- `CLAUDE.md` — fully German (project instructions: roles, autonomy, TDD rules, doc rules, commit checklist, project context). ~86 lines.
- `docs/next-session-sop.md` — predominantly German (~36 German lines of 125): headings, handoff narrative, work-table headers ("Thema", "sandbox-fähig"), "Arbeitsweise/Strategie/Technische Fallstricke" sections, Definition-of-Done checklist.
- `docs/roadmap.md` — predominantly German (~28 German lines of 84): "Härtung & erster externer User", Kill-Condition section, M1–M3 milestone descriptions, sequencing/dependencies/non-goals.

**Confirmed English (no German):**
- Root: `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
- `docs/`: `cli-reference.md`, `compliance.md`, `deployment.md`, `embeddings.md`, `integrations.md`, `mcp-tools.md`, `quickstart-real.md`, `schemas.md`, `team-setup.md`.
- `docs/research/2026-06-11-issue-74-coverage-gaps.md`.

German umlauts (ä ö ü ß) in markdown appear exclusively in the three files above.

### Category 4 — German in test files

33 distinct locations across 15 test files (under `__tests__/`). Two sub-types:

**Real German example strings (functional fixtures tied to the bilingual logic above):**
- `__tests__/core/role-detection.test.ts:7,52` — "CFO Thomas Berger äußert Budget-Bedenken", "Preisgespräch; …".
- `__tests__/core/deal-health.test.ts:164` — "CFO äußert Budget-Bedenken".
- `__tests__/core/llm.test.ts:76,92` — "Alice bedankt sich für das Gespräch." (mock response + assertion).
- `__tests__/mcp/tools/get-deal-health.test.ts:95` — "CFO äußert Budget-Bedenken" (markdown fixture).
- `__tests__/core/compliance.test.ts:18` — regex `/ki|künstlich/` (asserts German AI-disclosure locale wording — functional).

**German proper-name fixtures (names, arguably not "content to translate"):**
- `Max Müller` / `Müller, Hans` appear ~22 times as test data across `relationship-health.test.ts`, `org-intelligence.test.ts`, `graph-extractor.test.ts`, `deal-room.test.ts`, `deal-agent.test.ts`, `email-dedup.test.ts`, `email-normalizer.test.ts`, `get-org-intelligence.test.ts`, `approve-agent-action.test.ts`.
- `__tests__/core/encryption.test.ts:46` — "wörld" inside a multilingual Unicode test string.

`describe`/`it`/`test` description strings themselves were **not** found to contain German — test descriptions are already English. German appears in fixture data and a few assertions, not in test names.

### The existing offline guard — `scripts/check-doc-links.ts`

This is the script issue #80 points to as the model for a new language guard. It is invoked via `npm run docs:check` (`package.json:76` → `tsx scripts/check-doc-links.ts`).

How it works (`scripts/check-doc-links.ts`):
- `collectMarkdownFiles()` (`:19-30`) — starts from `README.md`, then recursively walks `docs/` collecting every `*.md` (including `docs/research/`). `ROOT` is the repo root (`:17`).
- `githubSlug()` (`:32-42`) — converts a heading to a GitHub-style anchor slug.
- `anchorsOf()` (`:44-56`) — builds the set of anchors in a file, handling duplicate-heading `-n` suffixes.
- `checkFile()` (`:64-87`) — strips fenced code blocks (`:68`, so example links aren't checked), regex-matches markdown links (`:69`), skips external `http(s)/mailto/tel` links (`:72`), resolves relative file targets and verifies existence (`:75-78`), and verifies `#anchor` targets resolve to a heading (`:79-84`).
- Top level (`:89-99`) — flat-maps findings across all files; on any finding prints `✗ N broken doc link(s)` with file → link → reason and `process.exit(1)`; otherwise prints `✓ all relative doc links and anchors resolve`.

Characteristics relevant to modeling a sibling guard: pure Node `fs`/`path`, no network, no extra deps, walks tracked markdown, emits a findings list, exits non-zero on failure. The header comment (`:1-13`) attributes it to issue #71.

### CI wiring — the quality stage

`.github/workflows/ci.yml` defines four sequential job stages. The relevant one is **Stage 1: `quality`** (`ci.yml:16-33`, job name "Lint & Typecheck"):
```
- npm ci
- npm run typecheck      (ci.yml:27)
- npm run lint           (ci.yml:28)
- npm run format:check   (ci.yml:29)
- "Dead code & dependency check (knip)" → npm run knip   (ci.yml:30-31)
- "Doc link check" → npm run docs:check                  (ci.yml:32-33)
```
Subsequent stages: `test` (Node 20/22 matrix, needs `quality`, `ci.yml:36-57`), `security` (audit + license check, `ci.yml:60-84`), `build-validate` (build + publint/attw + e2e consumer tests, `ci.yml:87-117`). The "Doc link check" step at `ci.yml:32-33` is the immediate neighbor a new language-guard step would sit next to per the issue.

CI triggers on push to `main`/`beta`/`alpha` and PRs to `main` (`ci.yml:3-7`).

### Related package scripts

From `package.json:73-90`:
- `docs:check` → `tsx scripts/check-doc-links.ts` (the link checker above).
- `docs:generate` → `tsx scripts/generate-docs.ts`.
- `lint` → `eslint src --max-warnings 0`; `format:check` → `prettier --check src __tests__`; `typecheck` → `tsc --noEmit && tsc --project tsconfig.types.json`; `knip` → `knip`; `test` → `vitest run`; `build` → `tsdown && node scripts/postbuild.js`.
- `scripts/` contains exactly three files: `check-doc-links.ts`, `generate-docs.ts`, `postbuild.js`.

## Code References

- `package.json:76` — `docs:check` script definition.
- `scripts/check-doc-links.ts:19-30` — markdown file collection (README + recursive `docs/`).
- `scripts/check-doc-links.ts:64-87` — per-file link/anchor checking; `:68` strips fenced code blocks.
- `scripts/check-doc-links.ts:92-99` — findings reporting + `process.exit(1)`.
- `.github/workflows/ci.yml:16-33` — Stage 1 `quality` job (typecheck, lint, format:check, knip, docs:check).
- `.github/workflows/ci.yml:32-33` — "Doc link check" step.
- `src/core/deal-health.ts:66-95` — bilingual `NEGATIVE_MARKERS` (English + German blocks).
- `src/core/deal-health.ts:97-109` — `POSITIVE_MARKERS` with German entries.
- `src/core/role-detection.ts:13-40` — `ROLE_SIGNALS` regexes with EN + DE alternatives.
- `src/core/role-detection.ts:3-9` — JSDoc documenting EN + DE detection (German example phrase).
- `src/core/graph-extractor.ts:120` — German phrase in a comment.
- `src/core/llm.ts:57` — system prompt instructing German summary output.
- `CLAUDE.md` (entire file) — German project instructions; no "Language Policy" section present.
- `docs/next-session-sop.md` — predominantly German internal handoff doc.
- `docs/roadmap.md` — predominantly German roadmap doc.

## Architecture Documentation

**Offline, dependency-free check pattern.** The repo's existing content guard (`check-doc-links.ts`) establishes a convention a language guard would mirror: a standalone `tsx` script under `scripts/`, run via an `npm run` alias, using only Node built-ins, collecting tracked text files, emitting a human-readable findings list, and exiting non-zero on violation. It deliberately strips fenced code blocks so examples don't trip the check — a pattern any text-scanning guard in this repo would likely reuse (with an allowlist, per the issue).

**Bilingual-by-design detection layer.** `src/core/` encodes German as a first-class part of the detection logic, not as an accident of translation. `deal-health.ts` (sentiment markers), `role-detection.ts` (stakeholder regexes), and `llm.ts` (summary output language) all intentionally handle/emit German. These are the points where "English-only" intersects with runtime behavior, and they are distinct from the prose/doc residue that can be translated freely.

**CI quality gating.** Content/quality checks are concentrated in the single `quality` job that all other stages depend on (`test` → `needs: quality`). A new guard added there gates the entire pipeline.

## Historical Context (from docs/)

- `docs/research/2026-06-11-issue-74-coverage-gaps.md` — prior research doc in this repo's research directory (the only existing one); establishes the `docs/research/YYYY-MM-DD-issue-NN-*.md` naming convention used for this document. (Note: this repo has no `thoughts/` directory; `docs/research/` is the analog.)

## Related Research

- `docs/research/2026-06-11-issue-74-coverage-gaps.md` (issue #74 — test coverage gaps).

## Open Questions

- **Names vs. content:** Whether German proper-name fixtures (`Max Müller`, `Müller, Hans`) count as "non-English content" under the policy, or are exempt as proper nouns — the issue does not specify. This determines whether the ~22 test-fixture occurrences are in scope.
- **Functional German scope:** The issue mandates "no behavior change," yet the only substantive German in `src/` (the `deal-health.ts`/`role-detection.ts` marker tables and the `llm.ts` German-summary instruction) is behavior-bearing. How the policy reconciles "English-only" with intentional bilingual detection is not stated in the issue.
- **Policy-branch state:** Issue #80 assumes `CLAUDE.md`/`roadmap.md`/`next-session-sop.md` are already English and that a `CLAUDE.md` "Language Policy" section exists; on `main` they are not and it does not. The relationship between the unmerged policy branch and `main` is unresolved at commit `b8c9774`.
