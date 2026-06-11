# SOP — Next Session (DatasynxOpenCRM)

> Handoff document for starting a new Claude Code session. Read this
> **first**, then `CLAUDE.md`. Status: **2026-06-11** · M1 ✅ + M3 (sandbox portion) ✅.
> Medium-term milestone view: [`roadmap.md`](./roadmap.md).
>
> **Single source of truth for open work = GitHub issues** (see section 0).
> Completed work lives in the git history, not here.

---

## 0. Current Status (Snapshot)

- **Phase:** Hardening & first external user. **M1 ✅**, **M3 sandbox portion ✅** (both 2026-06-10).
- **North Star / kill condition:** The first external user uses `dxcrm` **daily for 7 days without HubSpot**.
- **Tooling:** 82 MCP tools · 69 CLI commands (top-level) · ~3736 tests green · coverage gate (80% branches) green · npm 1.38.0+ (semantic-release publishes on every feat/fix merge to `main`).

### Open Issues (prioritized)

| Issue | Topic | sandbox-capable |
|---|---|---|
| **#73** | M2 — 7-day HubSpot-free hardening test (kill condition, bottleneck) | no (operator/dogfooding) |
| **#74** | Coverage edge gaps: `sync/calendly.ts`, `core/llm.ts`, `sync/calendar-availability.ts` | ✅ yes |
| **#75** | Unmatched Conversations: event + digest + `resolve` (mirrors #66) | ✅ yes |
| **#80** | Enforce the English-only policy across the codebase | ✅ yes |
| **#20** | Finish embedding evaluation (no blind swap) | no (HF access needed) |
| **#70** | Dependabot alert triage | no (operator input) |
| **#76–#79** | M4 (Slack channel, web dashboard, additional LLM providers, plugin marketplace) | gated by M2 |

> `gh` is installed and authenticated in this environment (full issue read/write), so
> issues can be created and updated directly. File follow-ups as you find them.

---

## 1. Session Start Checklist

```
□ Read CLAUDE.md + this SOP + docs/roadmap.md
□ git fetch origin main && git status   (main is ahead via semantic-release!)
□ npm ci  (container is ephemeral — otherwise vitest/tsx are missing)
□ npm test → baseline green?   npm run typecheck && npm run lint && npm run build
□ Check open issues (GitHub API / operator)
□ Create/check out a development branch; merging to main is authorized
```

---

## 2. Working Method (unchanged, non-negotiable)

For every issue **always** these 5 steps (each documented as a comment in the issue):

1. **Research** as a comment in the issue.
2. **Implementation plan** as a comment in the issue.
3. Implement **test-driven** (test first, then code).
4. **End-to-end test** against the real server/binary + optimize.
5. **Docs + merge to `main`** (README/`docs/`/`capabilities.ts`/harness in sync), close the issue with a mapping.

**Commit gate:** `npm test` green · `typecheck` · `lint` · `build` · docs in sync · `TOOL_COUNT` maintained.

---

## 3. Strategy — What Matters Next

- **🥇 P0 — M2 (#73):** the bottleneck. The operator sets up a real/test tenant, `dxcrm doctor
  --integrations --live` must be green for the providers in use (entry point).
  **Not** runnable from the sandbox — without user feedback, jump straight to P1.
  Every friction → a **new, tightly scoped issue** with repro (pattern: #41).
- **🥈 P1 — sandbox-suitable:** #74 (coverage), #75 (unmatched Conversations, once the
  hardening test shows it is needed), #80 (English-only).
- **🥉 P2 — #20:** only with HF access (`dxcrm eval-embeddings …`). No blind swap.
- **Gated (M4, #76–#79):** no new feature breadth before the kill condition passes.

---

## 4. Technical Pitfalls (lessons learned — save time!)

- **semantic-release drift:** After every feat/fix merge to `main`, semantic-release bumps
  `package.json`. Before every merge: `git pull origin main` → on divergence `git rebase main`,
  keep the remote `version`, then `--force-with-lease` on the feature branch.
- **Never run `dxcrm init` in the repo cwd** — it overwrites the real `CLAUDE.md`.
  Always use `DXCRM_DATA_DIR=/tmp/...`.
- **HF model download is blocked in the sandbox** → no embedding/LLM E2E here.
- **Credential-gated = offline no-op:** test with injected deps or a stubbed `fetch`
  (pattern: `subscription-create.ts`, `doctor-integrations.ts`, `transcript-discovery.ts`).
- **Dates/time zones:** `today`/`close_date` are parsed as **UTC midnight**. Compute date
  boundaries with `Date.UTC`/`getUTC*`, **never** with the local `new Date(y,m,d)`
  (otherwise off-by-one in TZ ahead of UTC). The suite runs pinned under `TZ=Asia/Tokyo`
  (`vitest.config.ts`) so such bugs do not first surface in non-UTC environments.
- **Testing routes:** Express app on port 0 + real `fetch` (`conversation-routes.test.ts`).
  Add new HTTP routes as a `register<X>Routes(app, dataDir)` module, not inline in
  `startHttp()` — otherwise not testable.
- **Rate limiters are module-global:** in route tests call `reset<X>Guards()` in `beforeEach`.
- **CLI error paths:** set `process.exitCode = 1` (not `process.exit()`); `runCli`
  honors that since #63 — regression test in `__tests__/cli.test.ts`.
- **Renewal is provider-filtered:** `renewExpiringSubscriptions(dataDir, fn, h, { provider })`
  — never drop the filter, otherwise one renewer eats foreign subs (the #63 bug).
- **Tool bookkeeping for a new MCP tool:** `ALL_TOOLS` + `TOOL_COUNT` in
  `src/setup/harness-content.ts`, `registerX` in `createMcpServer()`, RBAC group,
  `capabilities.ts` (table + detail), `npm run docs:generate`, update the pin test.
  CLI **subcommands**, by contrast, do not count toward the 69 (only top-level via the registry).
- **Count strings in README/doc headers** are partly outside the AUTOGEN blocks → manual.
- **Doc links:** `npm run docs:check` checks all relative links/anchors in README+docs
  (runs in the CI quality stage); external URLs are deliberately out of scope.
- **English-only:** `npm run check:language` flags German stopwords in tracked text files
  (CI quality stage, #80). Intentional German (bilingual detection keywords, the localized
  EU-AI-Act disclosure) is allowlisted in `scripts/check-language.ts`; add `i18n-allow` to a
  line or extend the allowlist for new legitimate matches.
- **Quote state machine:** `paid` is terminal — `acceptQuote`/`declineQuote` then return the
  quote unchanged (no event). Do not "simplify" this (the #68 bug).
- **commitlint:** subject ≤ 72 characters; scopes are enum-restricted (`cli, mcp, core, sync, …`).
- **ESM:** no `require()`; type-only imports for circular types.
- **Reusable patterns:** HMAC token, config store `.agentic/<feature>/<id>.json`,
  event bus `emitEvent`, routing `buildRoutingTable`+`routeMessage`, timeline
  `appendInteraction`, rate limit `createRateLimiter` + `clientIp` (`core/http-guard.ts`).

---

## 5. Definition of Done (per issue)

```
□ 5-step workflow documented in the issue
□ Tests first, all green; critical path covered
□ typecheck · lint · build clean
□ Real E2E executed (real server/binary / injected deps)
□ README + docs/ + capabilities + harness in sync (TOOL_COUNT maintained)
□ Merged to main (rebase over release commits!), pushed
□ Issue closed as completed with a mapping comment
□ roadmap.md + this SOP updated when the milestone status changes
```
