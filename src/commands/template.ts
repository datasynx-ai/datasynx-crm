import { Command } from "commander";
import { success, error, info, bold } from "../ui/colors.js";
import { listTemplates, getTemplate, writeTemplate, deleteTemplate } from "../fs/template-store.js";
import { interpolate, buildVariablesFromCustomer } from "../core/template-engine.js";
import type { EmailTemplate } from "../schemas/email-template.js";

export const templateCommand = new Command("template").description("Manage email templates");

templateCommand
  .command("list")
  .option("--category <category>", "Filter by category")
  .action((opts: { category?: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const templates = listTemplates(dataDir, opts.category ? { category: opts.category } : {});
    if (templates.length === 0) {
      console.log(info("No templates found."));
      return;
    }
    for (const t of templates) {
      console.log(`  ${bold(t.id)}  [${t.category}]  ${t.subject}`);
    }
  });

templateCommand
  .command("get <id>")
  .action((id: string) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const tmpl = getTemplate(dataDir, id);
    if (!tmpl) {
      console.error(error(`Template '${id}' not found`));
      process.exit(1);
    }
    console.log(bold(`Subject: ${tmpl.subject}`));
    console.log(`Category: ${tmpl.category}  Language: ${tmpl.language}`);
    console.log(`Variables: ${tmpl.variables.join(", ") || "(none defined)"}`);
    console.log("\n" + tmpl.body);
  });

templateCommand
  .command("preview <id>")
  .option("--slug <slug>", "Customer slug to preview with")
  .action(async (id: string, opts: { slug?: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const tmpl = getTemplate(dataDir, id);
    if (!tmpl) {
      console.error(error(`Template '${id}' not found`));
      process.exit(1);
    }
    const vars = opts.slug ? await buildVariablesFromCustomer(dataDir, opts.slug) : {};
    console.log(bold(`Subject: ${interpolate(tmpl.subject, vars)}`));
    console.log(interpolate(tmpl.body, vars));
  });

templateCommand
  .command("create <id>")
  .option("--category <category>", "Category", "general")
  .option("--subject <subject>", "Subject line")
  .action((id: string, opts: { category: string; subject?: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const existing = getTemplate(dataDir, id);
    if (existing) {
      console.error(error(`Template '${id}' already exists`));
      process.exit(1);
    }
    const tmpl: EmailTemplate = {
      id,
      subject: opts.subject ?? `Subject for ${id}`,
      category: opts.category,
      variables: [],
      language: "de",
      createdAt: new Date().toISOString(),
      body: `Hi {{firstName}},\n\n[your message here]\n\nMit freundlichen Grüßen,\n{{senderName}}`,
    };
    writeTemplate(dataDir, tmpl);
    console.log(success(`✓ Template '${id}' created in category '${opts.category}'`));
  });

templateCommand
  .command("delete <id>")
  .action((id: string) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const deleted = deleteTemplate(dataDir, id);
    if (deleted) {
      console.log(success(`✓ Template '${id}' deleted`));
    } else {
      console.error(error(`Template '${id}' not found`));
      process.exit(1);
    }
  });
