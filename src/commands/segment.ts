import { Command } from "commander";
import { info, success, error } from "../ui/colors.js";
import type { SegmentCriteria } from "../core/segments.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const segmentCommand = new Command("segment").description(
  "Manage customer segments (marketing lists)"
);

segmentCommand
  .command("define <name>")
  .description("Define a segment by criteria")
  .option("--stage <stage>", "relationship_stage (prospect|active|churned|paused)")
  .option("--tags <csv>", "Comma-separated tags (all must match)")
  .option("--min-deal-value <n>", "Minimum deal value")
  .option("--stale-days <n>", "Days since last update (staleness)")
  .action(
    async (
      name: string,
      opts: { stage?: string; tags?: string; minDealValue?: string; staleDays?: string }
    ) => {
      const criteria: SegmentCriteria = {
        ...(opts.stage ? { stage: opts.stage } : {}),
        ...(opts.tags ? { tags: opts.tags.split(",").map((s) => s.trim()) } : {}),
        ...(opts.minDealValue ? { minDealValue: Number(opts.minDealValue) } : {}),
        ...(opts.staleDays ? { staleDays: Number(opts.staleDays) } : {}),
      };
      const { defineSegment } = await import("../core/segments.js");
      defineSegment(dataDir(), name, criteria);
      console.log(success(`Segment '${name}' defined: ${JSON.stringify(criteria)}`));
    }
  );

segmentCommand
  .command("list")
  .description("List defined segments")
  .action(async () => {
    const { loadSegments } = await import("../core/segments.js");
    const segs = loadSegments(dataDir());
    if (segs.length === 0) {
      console.log(info("No segments defined."));
      return;
    }
    for (const s of segs) console.log(`${s.name}  ${JSON.stringify(s.criteria)}`);
  });

segmentCommand
  .command("members <name>")
  .description("List customers matching a segment")
  .action(async (name: string) => {
    const { loadSegments, evaluateSegment } = await import("../core/segments.js");
    const seg = loadSegments(dataDir()).find((s) => s.name === name);
    if (!seg) {
      console.error(error(`Segment not found: ${name}`));
      process.exitCode = 1;
      return;
    }
    const members = await evaluateSegment(dataDir(), seg.criteria);
    console.log(info(`${members.length} member(s):`));
    for (const slug of members) console.log(slug);
  });
