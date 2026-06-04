import { Command } from "commander";
import { info, success } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const sopCommand = new Command("sop").description(
  "Standard Operating Procedures (global / per customer)"
);

sopCommand
  .command("add <title>")
  .description("Add an SOP (global unless --slug given)")
  .option("--triggers <csv>", "Comma-separated trigger keywords", "")
  .option("--body <text>", "SOP body / steps", "")
  .option("--slug <slug>", "Customer slug (omit for global)")
  .action(async (title: string, opts: { triggers: string; body: string; slug?: string }) => {
    const { addSop } = await import("../core/sop.js");
    const triggers = opts.triggers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const s = addSop(dataDir(), {
      scope: opts.slug ? "customer" : "global",
      ...(opts.slug ? { slug: opts.slug } : {}),
      title,
      triggers,
      body: opts.body,
    });
    console.log(success(`SOP ${s.id} added (${s.scope}${opts.slug ? `:${opts.slug}` : ""}).`));
  });

sopCommand
  .command("list")
  .description("List SOPs (global + customer if --slug)")
  .option("--slug <slug>", "Customer slug")
  .action(async (opts: { slug?: string }) => {
    const { loadSops } = await import("../core/sop.js");
    const sops = loadSops(dataDir(), opts.slug);
    if (sops.length === 0) {
      console.log(info("No SOPs."));
      return;
    }
    for (const s of sops) console.log(`[${s.scope}] ${s.title}  (${s.triggers.join(", ")})`);
  });

sopCommand
  .command("find <query>")
  .description("Find SOPs relevant to a task")
  .option("--slug <slug>", "Customer slug")
  .action(async (query: string, opts: { slug?: string }) => {
    const { findSops } = await import("../core/sop.js");
    const hits = await findSops(dataDir(), query, opts.slug);
    if (hits.length === 0) {
      console.log(info("No matching SOPs."));
      return;
    }
    for (const s of hits) console.log(`[${s.scope}] ${s.title}`);
  });
