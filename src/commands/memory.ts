import { Command } from "commander";
import { info, success } from "../ui/colors.js";
import type { MemoryType } from "../core/memory.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}
const TYPES = ["fact", "preference", "learning", "instruction"];

export const memoryCommand = new Command("memory").description(
  "Agent memories (per customer + global)"
);

memoryCommand
  .command("add <text>")
  .description("Add a memory (global unless --slug given)")
  .option("--type <type>", "fact | preference | learning | instruction", "fact")
  .option("--slug <slug>", "Customer slug (omit for global)")
  .action(async (text: string, opts: { type: string; slug?: string }) => {
    const type = (TYPES.includes(opts.type) ? opts.type : "fact") as MemoryType;
    const { addMemory } = await import("../core/memory.js");
    const m = addMemory(dataDir(), {
      scope: opts.slug ? "customer" : "global",
      ...(opts.slug ? { slug: opts.slug } : {}),
      type,
      text,
    });
    console.log(success(`Memory ${m.id} stored (${m.scope}${opts.slug ? `:${opts.slug}` : ""}).`));
  });

memoryCommand
  .command("list")
  .description("List memories (global + customer if --slug)")
  .option("--slug <slug>", "Customer slug")
  .action(async (opts: { slug?: string }) => {
    const { loadMemories } = await import("../core/memory.js");
    const mems = loadMemories(dataDir(), opts.slug);
    if (mems.length === 0) {
      console.log(info("No memories."));
      return;
    }
    for (const m of mems) console.log(`[${m.scope}/${m.type}] ${m.text}`);
  });

memoryCommand
  .command("search <query>")
  .description("Search memories by relevance")
  .option("--slug <slug>", "Customer slug")
  .action(async (query: string, opts: { slug?: string }) => {
    const { searchMemory } = await import("../core/memory.js");
    const hits = await searchMemory(dataDir(), query, opts.slug);
    if (hits.length === 0) {
      console.log(info("No matching memories."));
      return;
    }
    for (const m of hits) console.log(`[${m.scope}/${m.type}] ${m.text}`);
  });
