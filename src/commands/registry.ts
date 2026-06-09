// Single source of truth for the dxcrm command set.
// Both the CLI entrypoint (src/cli.ts) and the docs generator
// (scripts/generate-docs.ts) consume this array, so the published
// CLI reference can never drift from the commands that actually ship.
import type { Command } from "commander";
import { createCommand } from "./create.js";
import { listCommand } from "./list.js";
import { validateCommand } from "./validate.js";
import { sessionCommand } from "./session.js";
import { guideCommand, mcpCommand } from "./guide.js";
import { initCommand } from "./init.js";
import { syncCommand } from "./sync.js";
import { backupCommand, restoreCommand } from "./backup.js";
import { daemonCommand } from "./daemon.js";
import { statusCommand } from "./status.js";
import { agentCommand } from "./agent.js";
import { importCommand } from "./import.js";
import { serverCommand } from "./server.js";
import { auditCommand } from "./audit.js";
import { logsCommand } from "./logs.js";
import { doctorCommand } from "./doctor.js";
import { pipelineCommand } from "./pipeline.js";
import { forecastCommand } from "./forecast.js";
import { rbacCommand } from "./rbac.js";
import { gdprCommand } from "./gdpr.js";
import { securityReportCommand } from "./security-report.js";
import { stagesCommand } from "./pipeline-stages.js";
import { pluginCommand } from "./plugin.js";
import { goalCommand } from "./goal.js";
import { pushCommand } from "./push.js";
import { attachCommand } from "./attach.js";
import { templateCommand } from "./template.js";
import { sequenceCommand } from "./sequence.js";
import { quoteCommand } from "./quote.js";
import { ticketCommand } from "./ticket.js";
import { surveyCommand } from "./survey.js";
import { kbCommand } from "./kb.js";
import { fieldsCommand, objectCommand } from "./fields.js";
import { webhookCommand } from "./webhook.js";
import { segmentCommand } from "./segment.js";
import { identityCommand } from "./identity.js";
import { metricsCommand } from "./metrics.js";
import { usageCommand } from "./usage.js";
import { approvalsCommand, policyCommand } from "./approvals.js";
import { hygieneCommand } from "./hygiene.js";
import { memoryCommand } from "./memory.js";
import { sopCommand } from "./sop.js";
import { toneCommand } from "./tone.js";
import { autofillCommand } from "./autofill.js";
import { askCommand } from "./ask.js";
import { nbaCommand } from "./nba.js";
import { vaultCommand } from "./vault.js";
import { churnCommand } from "./churn.js";
import { leadscoreCommand } from "./leadscore.js";
import { enrichCommand } from "./enrich.js";
import { coachCommand } from "./coach.js";
import { complianceCommand } from "./compliance.js";
import { mailboxCommand } from "./mailbox.js";
import { archiveCommand } from "./archive.js";
import { reindexCommand } from "./reindex.js";
import { evalEmbeddingsCommand } from "./eval-embeddings.js";

/** Every top-level `dxcrm` command, in display order. */
export const ALL_COMMANDS: readonly Command[] = [
  initCommand,
  createCommand,
  listCommand,
  validateCommand,
  sessionCommand,
  guideCommand,
  mcpCommand,
  syncCommand,
  mailboxCommand,
  backupCommand,
  restoreCommand,
  archiveCommand,
  reindexCommand,
  evalEmbeddingsCommand,
  daemonCommand,
  statusCommand,
  agentCommand,
  importCommand,
  serverCommand,
  auditCommand,
  logsCommand,
  doctorCommand,
  pipelineCommand,
  forecastCommand,
  rbacCommand,
  gdprCommand,
  securityReportCommand,
  stagesCommand,
  pluginCommand,
  goalCommand,
  pushCommand,
  attachCommand,
  templateCommand,
  sequenceCommand,
  quoteCommand,
  ticketCommand,
  surveyCommand,
  kbCommand,
  fieldsCommand,
  objectCommand,
  webhookCommand,
  segmentCommand,
  identityCommand,
  metricsCommand,
  usageCommand,
  approvalsCommand,
  policyCommand,
  hygieneCommand,
  memoryCommand,
  sopCommand,
  toneCommand,
  autofillCommand,
  askCommand,
  nbaCommand,
  vaultCommand,
  churnCommand,
  leadscoreCommand,
  enrichCommand,
  coachCommand,
  complianceCommand,
];
