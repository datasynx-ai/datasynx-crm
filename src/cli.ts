#!/usr/bin/env node
import { Command } from "commander";
import { createCommand } from "./commands/create.js";
import { listCommand } from "./commands/list.js";
import { validateCommand } from "./commands/validate.js";
import { sessionCommand } from "./commands/session.js";
import { guideCommand, mcpCommand } from "./commands/guide.js";
import { initCommand } from "./commands/init.js";
import { syncCommand } from "./commands/sync.js";
import { backupCommand, restoreCommand } from "./commands/backup.js";
import { daemonCommand } from "./commands/daemon.js";
import { statusCommand } from "./commands/status.js";
import { agentCommand } from "./commands/agent.js";
import { importCommand } from "./commands/import.js";
import { serverCommand } from "./commands/server.js";
import { auditCommand } from "./commands/audit.js";
import { rbacCommand } from "./commands/rbac.js";
import { gdprCommand } from "./commands/gdpr.js";
import { securityReportCommand } from "./commands/security-report.js";
import { stagesCommand } from "./commands/pipeline-stages.js";
import { pluginCommand } from "./commands/plugin.js";
import { goalCommand } from "./commands/goal.js";
import { pushCommand } from "./commands/push.js";
import { attachCommand } from "./commands/attach.js";
import { templateCommand } from "./commands/template.js";

const program = new Command();
program
  .name("dxcrm")
  .description("DatasynxOpenCRM — local-first, MCP-native CRM")
  .version("0.1.0")
  .exitOverride(); // for testability

program.addCommand(initCommand);
program.addCommand(createCommand);
program.addCommand(listCommand);
program.addCommand(validateCommand);
program.addCommand(sessionCommand);
program.addCommand(guideCommand);
program.addCommand(mcpCommand);
program.addCommand(syncCommand);
program.addCommand(backupCommand);
program.addCommand(restoreCommand);
program.addCommand(daemonCommand);
program.addCommand(statusCommand);
program.addCommand(agentCommand);
program.addCommand(importCommand);
program.addCommand(serverCommand);
program.addCommand(auditCommand);
program.addCommand(rbacCommand);
program.addCommand(gdprCommand);
program.addCommand(securityReportCommand);
program.addCommand(stagesCommand);
program.addCommand(pluginCommand);
program.addCommand(goalCommand);
program.addCommand(pushCommand);
program.addCommand(attachCommand);
program.addCommand(templateCommand);

await program.parseAsync(process.argv);
