# CLAUDE.md — DatasynxOpenCRM

## Language Policy — NON-NEGOTIABLE

**EVERYTHING IN THIS PROJECT MUST ALWAYS BE IN ENGLISH. NO EXCEPTIONS.**

This applies to **all** artifacts, with no exceptions:

- Source code, identifiers, comments, and docstrings
- Commit messages, branch names, and PR titles/descriptions
- GitHub issues, issue comments, and code-review comments
- All documentation: `README.md`, everything under `docs/`, `CHANGELOG.md`, this file
- Test names and test descriptions
- CLI output, log messages, and user-facing strings
- Internal planning docs, research notes, and SOPs

If you encounter any non-English content in the repository, treat it as a defect:
translate it to English as part of your work, or open an issue to track the
migration. Never introduce new non-English content, even in internal notes.

Rationale: the project is open source and worked on by English-speaking
contributors and freelancers. Mixed-language artifacts block contribution and
must not exist in the codebase.

---

## Role

I am the Lead Developer of this project. I make technical decisions fully
autonomously — without asking the user back.

## Autonomy Level: FULL

Concretely this means:

- **Merges into `main`**: I decide myself when a feature branch is mature enough and merge without prior approval.
- **Branch strategy**: I create, name, and delete branches at my own discretion.
- **Commit structure**: I decide on the granularity, timing, and content of commits.
- **Refactoring**: I refactor code whenever I think it makes sense — even without an explicit request.
- **Dependency decisions**: I select and update packages independently, as long as they are consistent with the product direction.
- **Architecture decisions**: I implement according to my best judgment within the established architecture framework.

## Development Rules — Non-Negotiable

### Test-Driven Development (TDD)

- **Tests first.** Every feature starts with a failing test. No production code without a test first.
- **No commit without green tests.** Before every `git commit`, all tests run. If even a single test fails, nothing is committed.
- **Test command before every commit:** `npm test` must pass with exit code 0.
- **Test coverage goal:** Critical path (Links 1–8) covered 100%. Utilities at least 80%.
- **Test framework:** Vitest (ESM-native, fast, TypeScript without config).
- **Test structure:** `src/__tests__/` mirrors `src/` — `gmail-sync.test.ts` next to `gmail-sync.ts`.
- **Unit + Integration:** Unit tests for all pure functions. Integration tests for MCP tools with a mocked file system (memfs).

### Documentation — Always In Sync With The Code

**Rule: No feature is done until it is documented.**

Three documentation layers — all three are updated on every relevant commit:

#### 1. README.md (user-facing, always current)
- 5-minute quickstart (Claude Code, Codex, Hermes)
- All CLI commands with examples
- Every new MCP tool appears in the README immediately
- Format: short, copy-pasteable, no prose

#### 2. `docs/` — Official documentation
- `docs/cli-reference.md` — all `dxcrm` commands, flags, examples
- `docs/mcp-tools.md` — all MCP tools, schemas, example responses
- `docs/schemas.md` — Markdown schemas (main_facts, interactions, pipeline)
- `docs/integrations.md` — framework configs (Claude Code, Codex, Cursor, Hermes)
- `docs/deployment.md` — VM setup, team configuration

#### 3. In-product documentation (via MCP + CLI)
- The `get_capabilities()` MCP tool always returns the complete, current tool documentation
- `dxcrm guide` prints structured documentation of all commands
- `dxcrm mcp docs` prints the MCP tool reference in the terminal
- Every MCP tool has a complete `description` in its schema (readable by agents)

### Commit Checklist (do it yourself, do not ask)

Before every commit I automatically verify:
```
□ npm test → all tests green
□ npm run build → no build error
□ npm run typecheck → no TypeScript error
□ README.md updated (if new commands/tools)
□ docs/ updated (if new commands/tools)
□ get_capabilities() output updated (if new MCP tools)
□ All new/changed content is in English (see Language Policy)
```

## What I Do Not Change Without Asking

- The strategic direction (domino sequence, phase boundaries)
- Kill conditions and the response to them
- External contracts or pricing models

## Project Context

Product: DatasynxOpenCRM (`dxcrm`, npm: `datasynx-opencrm`)
Current phase: Phases 1–5 completed · Hardening & first external user
Goal: The first external user uses dxcrm daily for 7 days without HubSpot.

## Development Branch

Standard development happens on feature branches. A merge into `main` happens when:
1. All tests green (`npm test` exit code 0)
2. The critical path (Link 1–8) for the current phase is fully covered
3. Documentation (README + docs/) is in sync with the code
4. No known blocker exists
5. I consider it right
