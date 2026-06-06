# Contributing to DatasynxOpenCRM

Thanks for your interest in improving `@datasynx/agentic-crm`. This guide
covers everything you need to land a high-quality change.

## Prerequisites

- **Node.js ≥ 20** and npm
- Git

```bash
git clone https://github.com/datasynx/datasynx-crm.git
cd datasynx-crm
npm ci
```

## Development Workflow

This project follows **Test-Driven Development**. The non-negotiables:

1. **Write the failing test first.** No production code without a test that
   first fails for the right reason. Tests live in `__tests__/`, mirroring
   `src/` (e.g. `__tests__/commands/ticket.test.ts` ↔ `src/commands/ticket.ts`).
2. **Keep the suite green.** `npm test` must exit 0 before every commit.
3. **Document as you go.** A feature isn't done until the docs are updated —
   see "Documentation" below.

### Useful scripts

| Command | Purpose |
|---------|---------|
| `npm test` | Run the full Vitest suite |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Coverage (critical path 100%, utilities ≥ 80%) |
| `npm run typecheck` | `tsc` type checking (strict) |
| `npm run lint` | ESLint (zero warnings allowed) |
| `npm run knip` | Dead code, unused exports & unused dependencies (zero issues allowed) |
| `npm run format` | Prettier write |
| `npm run build` | Build the distributable with tsdown |
| `npm run docs:generate` | Regenerate the CLI/MCP reference docs from code |

### Before you open a PR

```bash
npm run typecheck && npm run lint && npm run knip && npm run format:check && npm test && npm run build
```

A Husky pre-commit hook runs `lint-staged`, and a commit-msg hook enforces
Conventional Commits — so a clean local run means CI will be clean too.

## Documentation

The published reference (`docs/cli-reference.md`, `docs/mcp-tools.md`,
`docs/index.html`) is **generated from code**. If you add or change a CLI
command or MCP tool:

1. Give every command a `.description()` and every tool an entry in the
   `Available Tools` table in `src/mcp/capabilities.ts`.
2. Run `npm run docs:generate` and commit the result.

The drift-guard test (`__tests__/docs/docs-coverage.test.ts`) fails CI if a
command or tool is missing from the docs, so this can't be forgotten.

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) — releases
and the changelog are generated from them via semantic-release.

```
<type>(<scope>): <subject>
```

- **Types:** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`, `build`
- **Scopes** (optional): `cli`, `mcp`, `core`, `sync`, `backup`, `ticket`,
  `survey`, `kb`, `rbac`, `daemon`, `build`, `ci`, `docs`, `deps`, `security`,
  `e2e`, `types`
- **Subject:** imperative mood, ≤ 72 characters

Examples:

```
feat(mcp): add get_proactive_briefing tool
fix(sync): retry Gmail fetch on transient 5xx
docs: regenerate CLI reference
```

## Pull Requests

1. Branch off `main`.
2. Keep PRs focused; include tests and updated docs.
3. Fill out the PR template; describe the change and how you verified it.
4. Ensure all CI checks (lint, typecheck, format, tests on Node 20 & 22,
   audit, license, build) are green.

## Reporting Security Issues

Do **not** file public issues for vulnerabilities — see
[SECURITY.md](./SECURITY.md).

## Code of Conduct

By participating you agree to abide by our
[Code of Conduct](./CODE_OF_CONDUCT.md).
