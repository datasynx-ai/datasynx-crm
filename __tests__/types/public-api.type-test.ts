// Type-level tests for the public API surface.
// These run as part of `npm run typecheck` — type errors here = type regression.
import { expectTypeOf } from "expect-type";
import type {
  MainFacts,
  InteractionEntry,
  PipelineDeal,
  TicketRecord,
  QuoteRecord,
  KbArticle,
  SurveyDefinition,
  SurveyResponse,
  GlobalSources,
} from "../../src/index.js";
import type { RbacConfig, Role } from "../../src/core/rbac.js";
import type { CustomerSummary } from "../../src/mcp/tools/list-customers.js";

// ── MainFacts ────────────────────────────────────────────────────────────────
expectTypeOf<MainFacts["name"]>().toBeString();
expectTypeOf<MainFacts["relationship_stage"]>().toBeString();
expectTypeOf<MainFacts["deal_value"]>().toEqualTypeOf<number | undefined>();
expectTypeOf<MainFacts["domain"]>().toEqualTypeOf<string | undefined>();

// ── InteractionEntry ─────────────────────────────────────────────────────────
expectTypeOf<InteractionEntry["date"]>().toBeString();
expectTypeOf<InteractionEntry["type"]>().toBeString();
expectTypeOf<InteractionEntry["summary"]>().toBeString();

// ── PipelineDeal ─────────────────────────────────────────────────────────────
expectTypeOf<PipelineDeal["stage"]>().toBeString();
expectTypeOf<PipelineDeal["value"]>().toEqualTypeOf<number | undefined>();

// ── TicketRecord ─────────────────────────────────────────────────────────────
expectTypeOf<TicketRecord["id"]>().toBeString();
expectTypeOf<TicketRecord["title"]>().toBeString();
expectTypeOf<TicketRecord["status"]>().toBeString();
expectTypeOf<TicketRecord["priority"]>().toBeString();

// ── QuoteRecord ──────────────────────────────────────────────────────────────
expectTypeOf<QuoteRecord["quoteNumber"]>().toBeString();
expectTypeOf<QuoteRecord["status"]>().toBeString();
expectTypeOf<QuoteRecord["lineItems"]>().toBeArray();

// ── KbArticle ────────────────────────────────────────────────────────────────
expectTypeOf<KbArticle["id"]>().toBeString();
expectTypeOf<KbArticle["title"]>().toBeString();
expectTypeOf<KbArticle["category"]>().toBeString();
expectTypeOf<KbArticle["public"]>().toEqualTypeOf<boolean | undefined>();

// ── SurveyDefinition ─────────────────────────────────────────────────────────
expectTypeOf<SurveyDefinition["id"]>().toBeString();
expectTypeOf<SurveyDefinition["type"]>().toEqualTypeOf<"nps" | "csat" | "ces">();

// ── SurveyResponse ───────────────────────────────────────────────────────────
expectTypeOf<SurveyResponse["score"]>().toBeNumber();
expectTypeOf<SurveyResponse["contactEmail"]>().toBeString();

// ── RBAC ─────────────────────────────────────────────────────────────────────
expectTypeOf<Role>().toEqualTypeOf<"admin" | "manager" | "rep">();
expectTypeOf<RbacConfig["actors"]>().toEqualTypeOf<Record<string, Role>>();
expectTypeOf<RbacConfig["default"]>().toEqualTypeOf<Role | undefined>();

// ── CustomerSummary ──────────────────────────────────────────────────────────
expectTypeOf<CustomerSummary["slug"]>().toBeString();
expectTypeOf<CustomerSummary["name"]>().toBeString();
expectTypeOf<CustomerSummary["dealValue"]>().toEqualTypeOf<number | undefined>();
expectTypeOf<CustomerSummary["lastInteraction"]>().toEqualTypeOf<string | undefined>();

// ── Runtime export surface ───────────────────────────────────────────────────
// The programmatic API lives at the package root. These assertions fail at
// `npm run typecheck` if a runtime export changes shape.
import * as publicApi from "../../src/index.js";

expectTypeOf(publicApi.VERSION).toBeString();
expectTypeOf(publicApi.createCustomer).toBeFunction();
expectTypeOf(publicApi.runBackup).toBeFunction();
expectTypeOf(publicApi.readMainFacts).toBeFunction();
expectTypeOf(publicApi.customerExists).toBeFunction();
expectTypeOf(publicApi.canSeeCustomer).toBeFunction();
expectTypeOf(publicApi.getSession).toBeFunction();

// ── Leak-guard ───────────────────────────────────────────────────────────────
// Pin the *exact* set of runtime exports. Adding or removing a value export
// from src/index.ts breaks this until the union below is updated deliberately —
// preventing an internal helper from silently leaking into the public surface.
type RuntimeExportNames = keyof typeof publicApi;
expectTypeOf<RuntimeExportNames>().toEqualTypeOf<
  | "createCustomer"
  | "runBackup"
  | "runAudit"
  | "runValidate"
  | "readMainFacts"
  | "customerExists"
  | "readAuditLog"
  | "filterAuditLog"
  | "getRbacConfig"
  | "getRole"
  | "canSeeCustomer"
  | "getSession"
  | "setSession"
  | "clearSession"
  | "VERSION"
>();
