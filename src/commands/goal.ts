import { Command } from "commander";
import { pursueGoal, getActiveGoals, updateGoalProgress, cancelGoal } from "../core/goal-engine.js";
import { success, error, info, bold } from "../ui/colors.js";

export async function runGoalSet(description: string, options: { deadline: string }): Promise<void> {
  const dir = process.cwd();
  const goal = await pursueGoal(dir, { description, deadline: options.deadline });
  console.log(success(`✓ Goal created: ${bold(goal.id)}`));
  console.log(info(`  Description : ${goal.description}`));
  console.log(info(`  Target      : €${goal.target.toLocaleString()}`));
  console.log(info(`  Deadline    : ${goal.deadline}`));
  console.log(info(`  Pipeline P50: €${goal.decomposition.currentPipeline.toLocaleString()}`));
  console.log(info(`  Gap         : €${goal.decomposition.gap.toLocaleString()}`));
  if (goal.decomposition.subGoals.length > 0) {
    console.log(bold("\n  Action Plan:"));
    for (const sg of goal.decomposition.subGoals) {
      console.log(info(`  ${sg.priority}. ${sg.action}`));
      console.log(info(`     → ${sg.nextStep}`));
    }
  }
}

export async function runGoalStatus(): Promise<void> {
  const dir = process.cwd();
  const goals = getActiveGoals(dir);
  if (goals.length === 0) {
    console.log(info("No active goals. Use `dxcrm goal set` to create one."));
    return;
  }
  console.log(bold(`\n Active Goals (${goals.length})\n`));
  for (const g of goals) {
    const bar = "█".repeat(Math.round(g.progress / 10)) + "░".repeat(10 - Math.round(g.progress / 10));
    const deadlineMs = new Date(g.deadline).getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(deadlineMs / 86_400_000));
    console.log(bold(`  ${g.id}`));
    console.log(info(`  ${g.description}`));
    console.log(info(`  [${bar}] ${g.progress}%  |  €${g.target.toLocaleString()} by ${g.deadline} (${daysLeft}d left)`));
    console.log("");
  }
}

export async function runGoalUpdate(goalId: string, options: { progress: string }): Promise<void> {
  const dir = process.cwd();
  const progress = parseInt(options.progress, 10);
  if (isNaN(progress) || progress < 0 || progress > 100) {
    console.error(error("✗ --progress must be a number 0–100"));
    process.exit(1);
  }
  const updated = await updateGoalProgress(dir, goalId, progress);
  if (!updated) {
    console.error(error(`✗ Goal '${goalId}' not found`));
    process.exit(1);
  }
  console.log(success(`✓ Goal ${bold(goalId)} progress updated to ${bold(String(progress))}%`));
}

export async function runGoalCancel(goalId: string): Promise<void> {
  const dir = process.cwd();
  const cancelled = await cancelGoal(dir, goalId);
  if (!cancelled) {
    console.error(error(`✗ Goal '${goalId}' not found`));
    process.exit(1);
  }
  console.log(success(`✓ Goal ${bold(goalId)} cancelled`));
}

export const goalCommand = new Command("goal").description("Manage goals and action plans");

goalCommand
  .command("set <description>")
  .description("Set a new goal and get a decomposed action plan")
  .requiredOption("--deadline <date>", "Target deadline (YYYY-MM-DD)")
  .action((description: string, opts: { deadline: string }) => runGoalSet(description, opts));

goalCommand
  .command("status")
  .description("Show all active goals with progress")
  .action(() => runGoalStatus());

goalCommand
  .command("update <goalId>")
  .description("Update goal progress percentage")
  .requiredOption("--progress <n>", "Progress 0–100")
  .action((goalId: string, opts: { progress: string }) => runGoalUpdate(goalId, opts));

goalCommand
  .command("cancel <goalId>")
  .description("Cancel an active goal")
  .action((goalId: string) => runGoalCancel(goalId));
