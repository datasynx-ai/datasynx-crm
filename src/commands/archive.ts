import { Command } from "commander";
import { info, success } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const archiveCommand = new Command("archive")
  .description("Archive old interactions out of the hot interactions.md (search stays intact)")
  .argument("<slug>", "Customer slug")
  .option("--before <date>", "Archive entries strictly older than YYYY-MM-DD")
  .option("--keep <n>", "Keep the newest N entries in interactions.md", (v) => parseInt(v, 10))
  .action(async (slug: string, opts: { before?: string; keep?: number }) => {
    const { archiveInteractions } = await import("../core/archive.js");
    const res = await archiveInteractions(dataDir(), slug, {
      ...(opts.before ? { before: opts.before } : {}),
      ...(opts.keep !== undefined ? { keep: opts.keep } : {}),
    });

    if (res.archived === 0) {
      console.log(info(`Nothing to archive for ${slug} (${res.kept} entries kept).`));
      return;
    }

    console.log(success(`Archived ${res.archived} interaction(s) for ${slug}; ${res.kept} kept.`));
    for (const f of res.files) console.log(`  → ${f}`);
    console.log(
      info(
        "Archived entries remain searchable via search_customer_knowledge (LanceDB index intact)."
      )
    );
  });
