# Changelog

All notable changes to `@datasynx/opencrm` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [Unreleased]

### Changed — Optimization pass

- **Dependencies:** replaced the `googleapis` mega-package (~112 MB installed,
  pulls every Google API) with the scoped `@googleapis/gmail`,
  `@googleapis/calendar` and `google-auth-library` — cutting roughly 110 MB
  from the transitive install. Gmail/Calendar sync behavior is unchanged.
- **Dependencies:** dropped three declared-but-unused packages (`@iarna/toml`,
  `@topcli/spinner`, `which`).

### Fixed

- `dxcrm backup` / `dxcrm restore` now honor `DXCRM_DATA_DIR` (previously fell
  back to the current working directory).
- `dxcrm vault get|list` with a wrong master key now prints a clear error and
  exits 1 instead of crashing with an uncaught crypto exception.
- Consolidated the customer-slug listing duplicated across ~13 files into a
  single `listCustomerSlugs` helper; several copies used an unguarded
  `statSync` that could throw on a file-race — the shared helper guards it.

## [0.1.0] — 2026-06-02

### Added — Core Loop (Phase 1)

- `dxcrm init` — framework detection + MCP harness generation for 9 adapters (Claude Code, Codex, Cursor, Hermes, Continue, Cline, Zed, Windsurf, generic)
- `dxcrm create` — customer scaffold with `main_facts.md`, `interactions.md`, `pipeline.md`, `sources.json`
- `dxcrm sync <slug>` — Gmail + Google Calendar sync via googleapis (OAuth2), with pagination (5 pages via nextPageToken) and exponential backoff retry
- `dxcrm daemon start/stop/status` — background sync daemon running on 30-minute cron
- `dxcrm session open/close/status` — customer session management with active-session tracking
- `dxcrm validate` — schema validation for all customer directories against Zod schemas
- `dxcrm backup` — ZIP backup with SHA-256 integrity
- `dxcrm backup restore` — restore from a named backup archive
- `dxcrm backup verify` — verify backup integrity via SHA-256 checksum
- `dxcrm backup list` — list all available backups with metadata
- `dxcrm backup schedule` — automated backup schedule with configurable retention policy
- `dxcrm list` — customer list with pipeline health filter (hot/warm/cold/stalled)
- `dxcrm status` — CRM health dashboard showing sync state and unmatched transcripts
- `dxcrm audit` — audit log viewer with filtering by date, user, and operation
- `dxcrm gdpr erase` — GDPR erasure of all customer data including LanceDB vector cleanup
- `dxcrm guide` — in-terminal documentation for all commands

### Added — MCP Server (50 tools)

- **Customer CRUD**: `create_customer`, `get_customer`, `update_customer`, `delete_customer`, `list_customers`
- **Interaction management**: `add_interaction`, `get_interactions`, `update_interaction`, `delete_interaction`
- **Pipeline operations**: `get_pipeline`, `update_pipeline_stage`, `get_pipeline_health`
- **Session tools**: `open_session`, `close_session`, `get_session_status`
- **Sync tools**: `sync_customer`, `get_sync_status`, `list_unmatched_transcripts`
- **Search**: `search_customers`, `semantic_search` (LanceDB-backed vector search)
- **Knowledge base**: `create_kb_article`, `get_kb_article`, `list_kb_articles`, `delete_kb_article`
- **Sequences**: `create_sequence`, `get_sequence`, `list_sequences`, `update_sequence_step`
- **Email templates**: `create_template`, `get_template`, `list_templates`, `delete_template`
- **Quotes**: `create_quote`, `get_quote`, `list_quotes`, `update_quote_status`
- **Tickets**: `create_ticket`, `get_ticket`, `list_tickets`, `update_ticket_status`
- **Surveys**: `create_survey`, `get_survey`, `list_surveys`
- **RBAC**: `get_my_role`, `list_rbac_roles`, `set_rbac_role`
- **Audit**: `get_audit_log`
- **GDPR**: `gdpr_erase`
- **Capabilities**: `get_capabilities` — always returns current, complete tool documentation

### Added — Phase 2 Features

- `dxcrm agent spawn <slug>` — per-customer Telegram wake agent for real-time notifications
- Gmail sync pagination (5 pages via `nextPageToken`) + exponential backoff on rate-limit errors
- `dxcrm import --from hubspot|salesforce|pipedrive|csv` — CRM data migration
- `dxcrm import --mode api` — Salesforce and Pipedrive API-based import (OAuth)
- Telegram wake notification on new inbound email (via `notifyAgentWake`)

### Added — Enterprise Features

- RBAC with roles: `admin`, `manager`, `rep` — per-tool enforcement and customer visibility scoping
- Audit trail for all write operations (who, what, when, result)
- `dxcrm security-report` — SOC2 / security questionnaire export (Markdown + JSON)
- `dxcrm rbac show` — display current role assignments
- `dxcrm rbac set <user> <role>` — assign a role to a user
- `dxcrm rbac set-default <role>` — set the default role for new users
- `dxcrm rbac owned` — list customers owned by the current user
- LanceDB embedded semantic search with Float32 vectors and `@huggingface/transformers` embeddings
- Knowledge base articles, sequences, email templates, quotes, tickets, surveys

### Added — Developer / Package

- Dual ESM + CJS output via `tsdown`
- TypeScript declarations for all public APIs (`.d.ts` + `.d.cts`)
- `publint` + `@arethetypeswrong/cli` (`attw`) validation in `prepublishOnly`
- 5-stage GitHub Actions CI/CD pipeline (lint → typecheck → test → build → publish)
- `semantic-release` for automated versioning and changelog generation
- `commitlint` + `husky` pre-commit hooks enforcing Conventional Commits
- ESLint (`typescript-eslint`) + Prettier code quality tooling
- 2123 tests (Vitest, memfs for filesystem mocking, 80% coverage threshold)
- npm provenance attestation (`@datasynx/opencrm` scoped package, `publishConfig.provenance: true`)
