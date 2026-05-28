# Optimization Plan D18–D20

## Code Review Findings

### Critical
1. **`buildRiskAssessment` wrong signature** — `Partial<StakeholderProfile>[]` should be `StakeholderProfile[]`; the function is only called with full profiles and the looser signature creates false type safety
2. **`contacts[0]` unsafe access** in `deal-room.ts:85` — should be `contacts?.[0]` 
3. **Playbook matching uses wrong daysSinceContact** in `deal-room.ts:85-96` — uses first contact instead of the champion's contact

### Medium
4. **`_today` unused** in `buildStakeholderMap` — should drive `updatedAt` for deterministic testing
5. **`opportunities` always empty** in `buildDailyBriefing` — populate with high-health expansion signals
6. **Serial customer I/O** in `buildDailyBriefing` — parallelize with `Promise.all`
7. **D18-D20 not in `get_capabilities` output** — `capabilities.ts` stops at `get_push_status`
8. **D18-D20 missing from `docs/mcp-tools.md`** and **`README.md`**

### Minor
9. `buildTopPriorities` silently truncates at 2 deals — add overflow count
10. No error-path tests in MCP tool test files

## Implementation Plan

### Phase 1 — Code fixes (no API changes)
- [ ] P1-1: Fix `buildRiskAssessment` signature → `StakeholderProfile[]`
- [ ] P1-2: Fix `contacts?.[0]` + champion-aware daysSinceContact in deal-room
- [ ] P1-3: Use `today` in `buildStakeholderMap` for `updatedAt`
- [ ] P1-4: Populate `opportunities` in `buildDailyBriefing` (high-health customers)
- [ ] P1-5: Parallelize customer loop in `buildDailyBriefing` with `Promise.all`
- [ ] P1-6: Show overflow count in `buildTopPriorities` when >3 at-risk deals

### Phase 2 — E2E tests + error-path tests
- [ ] P2-1: E2E scenario: full customer (graph + health + pipeline) → `buildDealRoom` produces complete brief
- [ ] P2-2: E2E scenario: cold contact → `buildDailyBriefing` detects and flags decay
- [ ] P2-3: Test that `buildStakeholderMap` uses `today` for `updatedAt`
- [ ] P2-4: Error-path tests for `handleGetOrgIntelligence`, `handleOpenDealRoom`, `handleGetProactiveBriefing`

### Phase 3 — Documentation
- [ ] P3-1: Add D18-D20 to `src/mcp/capabilities.ts`
- [ ] P3-2: Add D18-D20 to `docs/mcp-tools.md`
- [ ] P3-3: Add D18-D20 to `README.md` MCP tools table + workflow section
