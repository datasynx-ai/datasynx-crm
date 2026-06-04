#!/usr/bin/env node
import { Command } from "commander";
import { ALL_COMMANDS } from "./commands/registry.js";

const program = new Command();
program
  .name("dxcrm")
  .description("DatasynxOpenCRM — local-first, MCP-native CRM")
  .version("0.1.0")
  .exitOverride(); // for testability

for (const command of ALL_COMMANDS) {
  program.addCommand(command);
}

await program.parseAsync(process.argv);
