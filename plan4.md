# plan4.md — Phase 4: Enterprise Layer
# DatasynxOpenCRM — Weeks 13–16

## Status: COMPLETE ✅

All Phase 4 features implemented, tested, documented, and merged.

---

## Phase 4 Goals

Enable enterprise adoption: RBAC, GDPR compliance, external integrations (Microsoft Outlook, Salesforce), concurrent-write hardening, and a security questionnaire for procurement.

**Kill condition**: If enterprise trial user reports data loss or permission bypass → rollback Phase 4 features and freeze on Phase 3.

---

## Sprint Plan

### Week 13 — Concurrent-Write Hardening ✅

**Goal**: Eliminate race conditions when multiple AI agents write to the same customer file simultaneously.

**Deliverables:**
- [x] `src/fs/write-queue.ts` — barrier-based promise queue, one queue per file path
- [x] `src/fs/interactions-writer.ts` — `appendInteraction` wrapped in `withFileQueue`
- [x] `__tests__/fs/write-queue.test.ts` — 5 tests: serialization, isolation, error resilience

**Technical notes:**
- `Map<string, Promise<void>>` pattern — no external locking library
- Barrier-based: errors in one queued call don't block subsequent calls
- `appendFileSync` for audit.log is atomic for lines <4096 bytes on Linux (O_APPEND semantics)

---

### Week 14 — RBAC ✅

**Goal**: Per-actor permission enforcement at the MCP tool layer.

**Deliverables:**
- [x] `src/core/rbac.ts` — role definitions, config read/write, `canWrite`, `assertCanWrite`
- [x] `src/commands/rbac.ts` — `dxcrm rbac set/show/check`
- [x] `src/cli.ts` — `rbacCommand` registered
- [x] `__tests__/core/rbac.test.ts`
- [x] `__tests__/commands/rbac.test.ts`

**Roles**: `admin` > `manager` > `rep`
**Config**: `.agentic/rbac.json`
**Actor**: `DXCRM_ACTOR` env var → fallback: config.default → fallback: `"rep"`
**Enforcement point**: Top of each MCP tool handler (not router-level)

---

### Week 14 — GDPR Erasure ✅

**Goal**: One-command customer data deletion with audit trail and dry-run safety.

**Deliverables:**
- [x] `src/commands/gdpr.ts` — `runGdprErase`, `runGdprListErasures`, `gdprCommand`
- [x] `src/cli.ts` — `gdprCommand` registered
- [x] `__tests__/commands/gdpr.test.ts` — 16 tests

**On confirmed erasure:**
1. `fs.rmSync(customerDir, { recursive: true, force: true })`
2. `writeAuditEntry(dataDir, { actor, tool: "gdpr_erase", slug, summary: "..." })`
3. Append to `.agentic/gdpr-erasures.json`

---

### Week 15 — Microsoft Outlook Sync ✅

**Goal**: Sync Outlook emails via Microsoft Graph API, same pipeline as Gmail.

**Deliverables:**
- [x] `src/sync/microsoft-auth.ts` — reads `.agentic/microsoft-token.json`
- [x] `src/sync/microsoft-sync.ts` — `syncMicrosoft()` with deduplication and LLM summarization
- [x] `src/commands/sync.ts` — `--provider microsoft` support
- [x] `__tests__/sync/microsoft-auth.test.ts` — 4 tests
- [x] `__tests__/sync/microsoft-sync.test.ts` — 6 tests

**API**: `GET /v1.0/me/messages` (Microsoft Graph)
**sourceRef format**: `microsoft://message/<id>`
**Auth**: `.agentic/microsoft-token.json` — supports `accessToken` and `access_token`

---

### Week 15 — Salesforce API Import ✅

**Goal**: Two-pass import from Salesforce REST API (contacts → customers, tasks → interactions).

**Deliverables:**
- [x] `src/sync/salesforce-client.ts` — `fetchSalesforceContacts`, `fetchSalesforceTasks`
- [x] `src/commands/import.ts` — `--from salesforce --mode api` path
- [x] `__tests__/sync/salesforce-client.test.ts` — 5 tests

**API**: Salesforce REST v58.0 SOQL
**sourceRef format**: `salesforce://task/<id>`
**Two-pass**: contacts → slug map → tasks with WhoId attribution

---

### Week 16 — Security Report ✅

**Goal**: Generate a procurement-ready Markdown security questionnaire.

**Deliverables:**
- [x] `src/commands/security-report.ts` — `runSecurityReport`, `securityReportCommand`
- [x] `src/cli.ts` — `securityReportCommand` registered
- [x] `docs/team-setup.md`

**Sections covered**: data storage, auth, encryption, audit trail, network calls, GDPR, SOC 2, dependency management

---

## Test Results

```
Test Files: 55 passed (55)
Tests:      526 passed (526)
```

---

## Documentation Updates

- [x] `README.md` — Phase 4 commands, Security & Compliance section
- [x] `docs/cli-reference.md` — rbac, gdpr, security-report, sync --provider, import salesforce
- [x] `docs/team-setup.md` — NEW: team member onboarding guide
- [x] `docs/deployment.md` — VM setup (Phase 3, still current)

---

## Architecture Decisions

### Why no external RBAC library?
Simple role-per-actor map in JSON. Three roles is not a graph problem. Adding a library would require auth middleware refactor that's not in scope.

### Why `vi.resetModules()` + explicit mock re-init in some tests?
Vitest with ESM mocks: after `vi.resetModules()`, the mock factory creates new `vi.fn()` instances, but `vi.clearAllMocks()` may not clear custom `mockResolvedValue` overrides set in previous tests. Safe pattern: re-apply mock values explicitly after `clearAllMocks()` in tests that need specific return values.

### Why barrier-based write queue vs. file locking?
`flock` requires native bindings. Mutex libraries add surface area. The barrier pattern is pure JS, 15 lines, easily auditable, and handles error isolation correctly.

### Why Microsoft Graph API vs. EWS?
Graph API is the current Microsoft recommendation. EWS is deprecated for new integrations. `fetch` (Node 18+ built-in) is sufficient — no SDK required.

---

## Next Phase (Phase 5 — if triggered)

Potential Phase 5 topics:
- OAuth flow automation (currently manual token file placement)
- Webhook-based real-time sync (vs. polling)
- Multi-tenant SaaS packaging
- Vector search upgrades (LanceDB → cloud)
- HubSpot / Pipedrive bidirectional sync
