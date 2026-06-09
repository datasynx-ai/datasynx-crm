import { Command } from "commander";
import { success, error, info, bold } from "../ui/colors.js";
import { listWorkflows, saveWorkflow, toggleWorkflow } from "../core/workflow-engine.js";
import type { WorkflowAction, WorkflowCondition } from "../core/workflow-engine.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const workflowCommand = new Command("workflow").description(
  "Declarative if-then automation rules over internal events"
);

workflowCommand
  .command("add <name>")
  .description("Add a rule (conditions/actions as JSON)")
  .requiredOption("--trigger <event>", 'Event name or wildcard, e.g. "deal.updated"')
  .option(
    "--conditions <json>",
    'JSON array, e.g. [{"field":"deal.stage","op":"eq","value":"won"}]'
  )
  .requiredOption("--actions <json>", 'JSON array, e.g. [{"tool":"notify","args":{"message":"…"}}]')
  .option("--disabled", "Create the rule disabled")
  .action(
    (
      name: string,
      opts: { trigger: string; conditions?: string; actions: string; disabled?: boolean }
    ) => {
      try {
        const conditions = opts.conditions
          ? (JSON.parse(opts.conditions) as WorkflowCondition[])
          : [];
        const actions = JSON.parse(opts.actions) as WorkflowAction[];
        const wf = saveWorkflow(dataDir(), {
          name,
          trigger: opts.trigger,
          conditions,
          actions,
          enabled: !opts.disabled,
        });
        console.log(success(`✓ Workflow '${wf.id}' (${wf.name}) on ${wf.trigger}`));
      } catch (err) {
        console.error(error((err as Error).message));
        process.exit(1);
      }
    }
  );

workflowCommand
  .command("list")
  .description("List automation rules")
  .action(() => {
    const all = listWorkflows(dataDir());
    if (all.length === 0) {
      console.log(info("No workflows. Add one with 'dxcrm workflow add'."));
      return;
    }
    for (const w of all) {
      const state = w.enabled ? "on " : "off";
      const runs = w.runCount ? `  runs:${w.runCount}` : "";
      console.log(
        `  ${bold(w.id)}  [${state}]  ${w.name}  on ${w.trigger} → ${w.actions.map((a) => a.tool).join(", ")}${runs}`
      );
    }
  });

for (const [cmd, enabled] of [
  ["enable", true],
  ["disable", false],
] as const) {
  workflowCommand
    .command(`${cmd} <id>`)
    .description(`${cmd === "enable" ? "Enable" : "Disable"} a rule`)
    .action((id: string) => {
      const wf = toggleWorkflow(dataDir(), id, enabled);
      if (!wf) {
        console.error(error(`Workflow '${id}' not found`));
        process.exit(1);
      }
      console.log(success(`✓ ${wf.name} is now ${enabled ? "enabled" : "disabled"}`));
    });
}
