# Roadmap — DatasynxOpenCRM

> Status: 2026-06-11 · npm `datasynx-opencrm` 1.38.0+ · Phase: **Hardening & first external user**
>
> This document is the **medium-term steering view** (milestones, sequencing,
> exit criteria). Operational session handoff (checklists, pitfalls, working method)
> lives in the [SOP](./next-session-sop.md); the public short version in the
> [README](../README.md#roadmap). **Open work in detail = GitHub issues.**

---

## North Star

**Kill condition:** The first external user uses `dxcrm` **daily for 7 days without HubSpot**.

Every prioritization is measured against exactly one question: *Does it bring the first
external user closer to "7 days without HubSpot"?*

## Where We Stand

- **Phases 1–5 + M1 + the M3 sandbox portion completed.** 82 MCP tools · 69 CLI commands ·
  local Markdown/NDJSON stores · ~3736 tests green · coverage gate (80% branches) green.
  Delivery details: git history and closed issues (#61–#69, #71, #72).
- **Bottleneck:** Many live paths are credential-gated no-ops. Core logic and routing are
  tested, but Teams/Meet subscriptions, WhatsApp sending, calendar free/busy, and Stripe
  do not run offline. The path to the kill condition runs through **activating & hardening**,
  not through more feature breadth.

---

## Milestones

### M1 — Live-ready *(P0)* — ✅ completed 2026-06-10
Every core integration can be activated for real, no live path is an offline no-op anymore,
public endpoints hardened (#61–#64). Entry point for M2: `dxcrm doctor --integrations --live`.

### M2 — The 7-day hardening test *(P1, the bottleneck)* — ⏳ **#73**
Run the acceptance criterion itself (real/test tenant). Daily operation across the
critical path (Link 1–8); every friction → a new, tightly scoped issue (pattern: #41).
**Exit criterion:** 7 consecutive days without HubSpot, with all P0/P1 friction issues that
arise along the way closed. **→ Kill condition met.** *Operator/dogfooding task.*

### M3 — Quality & robustness *(P2/P3, partly parallel)*
Sandbox portion completed (route integration tests, outbound robustness, unmatched-
transcript queue, coverage gate; #65–#69). **Open:**
- **#74** — remaining coverage edge gaps (`sync/calendly.ts`, `core/llm.ts` providers,
  `sync/calendar-availability.ts`). Sandbox-capable.
- **#75** — Unmatched **Conversations** (carry the #66 pattern over to Conversations).
- **#20** — finish embedding evaluation; needs an environment with HF model access. No blind swap.

### M4 — After the kill condition *(deliberately not started, gated by M2)*
- **#76** Slack as a first-class notification channel · **#77** read-only web dashboard ·
  **#78** additional LLM providers for on-device summarization · **#79** community plugin marketplace.

### Cross-cutting
- **#80** Enforce the English-only policy across the codebase (sandbox-capable).
- **#70** Dependabot alert triage (waiting on operator input).

---

## Sequencing & Dependencies

```
M1 (Live-ready) ──→ M2 (7-day hardening test) ──→ M4 (Growth)
        │
M3 runs partly in parallel; #20 is environment-dependent (HF access)
```

- M2 requires M1: without a return channel, subscription creation, and setup docs, an honest hardening test is not possible.
- M3 items are individually pickable and block nothing; #20 is pulled as soon as an environment with model access is available.
- M4 is hard-gated by M2 — no new feature breadth before the kill condition passes.

## Non-Goals (deliberate)

- No new feature surfaces before M2 (the bottleneck is activation, not breadth).
- No embedding default change without measurement (the #20 rule).
- No custom web UI beyond portal + chat widget before M4.
- No change to strategic direction, kill conditions, or external contracts without asking (see `CLAUDE.md`).

## Maintenance

This roadmap is updated at every milestone completion (and on new insights from the
hardening test). Operational details and lessons learned belong in the
[SOP](./next-session-sop.md), not here.
