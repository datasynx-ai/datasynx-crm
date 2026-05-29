import { Command } from "commander";
import { success, error, info, bold } from "../ui/colors.js";
import { listKbArticles, getKbArticle, writeKbArticle, deleteKbArticle, searchKbSimple } from "../fs/knowledge-base.js";
import type { KbArticle } from "../schemas/kb-article.js";

export const kbCommand = new Command("kb").description("Manage the knowledge base");

kbCommand
  .command("list")
  .description("List all KB articles")
  .option("--category <cat>", "Filter by category")
  .option("--public", "Show only public articles")
  .action((opts: { category?: string; public?: boolean }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const articles = listKbArticles(dataDir, {
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.public ? { publicOnly: true } : {}),
    });
    if (articles.length === 0) { console.log(info("No articles found.")); return; }
    for (const a of articles) {
      const pub = a.public ? " [public]" : "";
      console.log(`  ${bold(a.id)}  [${a.category}]  ${a.title}${pub}`);
    }
  });

kbCommand
  .command("get <id>")
  .description("Get a KB article")
  .action((id: string) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const article = getKbArticle(dataDir, id);
    if (!article) { console.error(error(`Article '${id}' not found`)); process.exit(1); }
    console.log(bold(article.title));
    console.log(`Category: ${article.category}  Tags: ${article.tags.join(", ") || "(none)"}`);
    console.log("\n" + article.body);
  });

kbCommand
  .command("search <query>")
  .description("Search KB articles")
  .option("--public", "Search only public articles")
  .action((query: string, opts: { public?: boolean }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const results = searchKbSimple(dataDir, query, opts.public ? { publicOnly: true } : {});
    if (results.length === 0) { console.log(info("No results.")); return; }
    for (const a of results) {
      console.log(`  ${bold(a.id)}  ${a.title}`);
      console.log(`    ${a.body.slice(0, 120).replace(/\n/g, " ")}...`);
    }
  });

kbCommand
  .command("create <id>")
  .description("Create a KB article (opens editor-ready template)")
  .requiredOption("--title <title>", "Article title")
  .option("--category <cat>", "Category", "general")
  .option("--ticket <id>", "Source ticket ID")
  .action((id: string, opts: { title: string; category: string; ticket?: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const now = new Date().toISOString();
    const article: KbArticle = {
      id,
      title: opts.title,
      category: opts.category,
      tags: [],
      public: false,
      createdAt: now,
      updatedAt: now,
      ...(opts.ticket ? { sourceTicketId: opts.ticket } : {}),
      body: `## Problem\n\n[Describe the problem]\n\n## Solution\n\n[Describe the solution]`,
    };
    writeKbArticle(dataDir, article);
    console.log(success(`✓ Article '${id}' created in category '${opts.category}'`));
    console.log(info(`Edit: .agentic/knowledge-base/${opts.category}/${id}.md`));
  });

kbCommand
  .command("delete <id>")
  .description("Delete a KB article")
  .action((id: string) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    if (deleteKbArticle(dataDir, id)) {
      console.log(success(`✓ Article '${id}' deleted`));
    } else {
      console.error(error(`Article '${id}' not found`));
      process.exit(1);
    }
  });
