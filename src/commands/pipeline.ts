import { Command } from "commander";
import { success, error, warning, info, bold } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export const pipelineCommand = new Command("pipeline").description(
  "Pipelines: create named pipelines, daily snapshots and 'what changed?' diffs"
);

pipelineCommand
  .command("create <id>")
  .description("Create a named pipeline with its own stage set (#47)")
  .option("--label <label>", "Display label")
  .action(async (id: string, opts: { label?: string }) => {
    const { createPipeline } = await import("../core/pipelines.js");
    try {
      const def = createPipeline(dataDir(), {
        id,
        ...(opts.label ? { label: opts.label } : {}),
      });
      console.log(
        success(
          `Pipeline '${def.id}' created with ${def.stages.length} stages (customize via 'dxcrm stages set … --pipeline ${def.id}').`
        )
      );
    } catch (err) {
      console.log(error((err as Error).message));
      process.exitCode = 1;
    }
  });

pipelineCommand
  .command("list-pipelines")
  .description("List all pipelines and their stage counts")
  .action(async () => {
    const { listPipelines } = await import("../core/pipelines.js");
    for (const p of listPipelines(dataDir())) {
      console.log(`${p.id.padEnd(20)} ${p.label.padEnd(24)} ${p.stages.length} stages`);
    }
  });

pipelineCommand
  .command("snapshot")
  .description("Capture a snapshot of the current pipeline across all customers")
  .action(async () => {
    const { takeSnapshot } = await import("../core/snapshots.js");
    const snap = takeSnapshot(dataDir());
    console.log(success(`Snapshot ${snap.id} taken — ${snap.deals.length} deal(s).`));
  });

pipelineCommand
  .command("list")
  .description("List available pipeline snapshots")
  .action(async () => {
    const { listSnapshots } = await import("../core/snapshots.js");
    const snaps = listSnapshots(dataDir());
    if (snaps.length === 0) {
      console.log(
        info("No snapshots yet. Run 'dxcrm pipeline snapshot' (or let the daemon take daily ones).")
      );
      return;
    }
    for (const s of snaps) {
      console.log(
        `${s.id}  ${String(s.dealCount).padStart(4)} deals  open €${s.openValue.toLocaleString()}`
      );
    }
  });

pipelineCommand
  .command("changes")
  .description("Show what changed in the pipeline since a date (default: 7 days ago)")
  .option("--since <YYYY-MM-DD>", "Baseline date (default: 7 days ago)")
  .action(async (opts: { since?: string }) => {
    const since = opts.since ?? daysAgoIso(7);
    const { diffAgainstNow } = await import("../core/snapshots.js");
    const diff = diffAgainstNow(dataDir(), since);
    if (!diff) {
      console.log(
        warning(`No snapshot at or before ${since}. Take snapshots first (or wait for the daemon).`)
      );
      return;
    }

    console.log(bold(`Pipeline changes since ${diff.fromId}`));
    const line = (label: string, n: number) => `  ${label.padEnd(16)} ${n}`;
    console.log(success(line("Won", diff.won.length)));
    console.log(error(line("Lost", diff.lost.length)));
    console.log(line("New deals", diff.added.length));
    console.log(line("Removed", diff.removed.length));
    console.log(line("Stage moves", diff.advanced.length));
    console.log(line("Value changes", diff.valueChanged.length));

    const delta = diff.openValueDelta;
    const deltaStr = `${delta >= 0 ? "+" : ""}€${delta.toLocaleString()}`;
    console.log(
      `  ${"Open value".padEnd(16)} €${diff.openValueAfter.toLocaleString()} (${
        delta >= 0 ? success(deltaStr) : error(deltaStr)
      })`
    );

    if (diff.won.length) console.log(success(`\nWon: ${diff.won.map((d) => d.name).join(", ")}`));
    if (diff.lost.length) console.log(error(`Lost: ${diff.lost.map((d) => d.name).join(", ")}`));
    if (diff.advanced.length) {
      console.log(info("\nStage moves:"));
      for (const m of diff.advanced) console.log(`  ${m.slug}/${m.name}: ${m.from} → ${m.to}`);
    }
    if (diff.added.length) {
      console.log(info("\nNew deals:"));
      for (const d of diff.added) console.log(`  ${d.slug}/${d.name}`);
    }
  });

pipelineCommand
  .command("velocity")
  .description("Stage dwell times, sales cycle, and stalled deals from snapshot history")
  .option("--stalled-days <n>", "Days in one stage before a deal counts as stalled (default 14)")
  .action(async (opts: { stalledDays?: string }) => {
    const { analyzeVelocity } = await import("../core/velocity.js");
    const analyzeOpts: { stalledDays?: number } = {};
    if (opts.stalledDays !== undefined) {
      const n = parseInt(opts.stalledDays, 10);
      if (Number.isFinite(n) && n > 0) analyzeOpts.stalledDays = n;
    }
    const report = analyzeVelocity(dataDir(), analyzeOpts);
    if (report.snapshotCount === 0) {
      console.log(
        info("No snapshots yet. Run 'dxcrm pipeline snapshot' (or let the daemon take daily ones).")
      );
      return;
    }

    console.log(
      bold(
        `Pipeline velocity (${report.snapshotCount} snapshots, ${report.fromId} → ${report.toId})`
      )
    );
    if (report.stageDurations.length) {
      console.log(info("\nAvg time in stage:"));
      for (const s of report.stageDurations) {
        const samples = `${s.samples} sample${s.samples === 1 ? "" : "s"}`;
        console.log(`  ${s.stage.padEnd(14)} ${s.avgDays}d  (${samples})`);
      }
    }
    const cycle = report.avgSalesCycleDays;
    const cycleStr = cycle === null ? "n/a (no won deals yet)" : `${cycle}d avg`;
    console.log(`\n  ${"Sales cycle".padEnd(14)} ${cycleStr} over ${report.wonCount} won`);

    if (report.stalledDeals.length) {
      console.log(error(`\nStalled deals (> ${report.stalledThresholdDays}d in stage):`));
      for (const d of report.stalledDeals) {
        console.log(
          `  ${d.slug}/${d.name}: ${d.stage}, ${d.daysInStage}d  €${d.value.toLocaleString()}`
        );
      }
    } else {
      console.log(success(`\nNo stalled deals (threshold ${report.stalledThresholdDays}d).`));
    }
  });

pipelineCommand
  .command("funnel")
  .description("Conversion funnel & win rate: where deals leak out of the pipeline")
  .action(async () => {
    const { analyzeFunnel } = await import("../core/funnel.js");
    const report = analyzeFunnel(dataDir());
    if (report.snapshotCount === 0) {
      console.log(
        info("No snapshots yet. Run 'dxcrm pipeline snapshot' (or let the daemon take daily ones).")
      );
      return;
    }

    console.log(
      bold(`Pipeline funnel (${report.snapshotCount} snapshots, ${report.fromId} → ${report.toId})`)
    );
    for (const s of report.stages) {
      const conv = s.conversionPctToNext === null ? "" : `  → ${s.conversionPctToNext}% convert`;
      console.log(`  ${s.stage.padEnd(14)} ${String(s.reached).padStart(4)} reached${conv}`);
    }

    const wr = report.winRatePct;
    const wrStr = wr === null ? "n/a (nothing closed yet)" : `${wr}%`;
    console.log(
      `\n  ${"Win rate".padEnd(14)} ${wrStr} (${report.wonCount} won / ${report.lostCount} lost)`
    );

    if (report.biggestLeak) {
      const l = report.biggestLeak;
      console.log(error(`\nBiggest leak: ${l.from} → ${l.to} (only ${l.conversionPct}% convert)`));
    }
  });
