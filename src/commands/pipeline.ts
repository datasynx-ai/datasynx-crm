import { Command } from "commander";
import { success, error, warning, info, bold } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export const pipelineCommand = new Command("pipeline").description(
  "Pipeline time-travel: daily snapshots and 'what changed?' diffs"
);

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
