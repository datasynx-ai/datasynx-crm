import { Command } from "commander";
import path from "path";
import fs from "fs";
import slugify from "slug";
import { ensureCustomerDir, writeMainFacts } from "../fs/customer-dir.js";
import { writeFileAtomic } from "../fs/atomic-write.js";
import { writeJsonFile } from "../fs/json-store.js";
import { success, error, bold } from "../ui/colors.js";

export async function createCustomer(opts: {
  name: string;
  domain?: string;
  email?: string;
  dataDir?: string;
}): Promise<{ id: string; dir: string }> {
  const id = slugify(opts.name, { lower: true });
  const dataDir = opts.dataDir ?? process.env["DXCRM_DATA_DIR"] ?? process.cwd();
  await ensureCustomerDir(dataDir, id);
  const dir = path.join(dataDir, "customers", id);

  // Write main_facts.md
  const today = new Date().toISOString().slice(0, 10);
  await writeMainFacts(dataDir, id, {
    name: opts.name,
    domain: opts.domain,
    email: opts.email,
    relationship_stage: "prospect",
    tags: [],
    currency: "EUR",
    created: today,
    updated: today,
  });

  // Create interactions.md
  const interactionsPath = path.join(dir, "interactions.md");
  if (!fs.existsSync(interactionsPath)) {
    writeFileAtomic(interactionsPath, `# Interactions — ${opts.name}\n\n`);
  }

  // Create pipeline.md
  const pipelinePath = path.join(dir, "pipeline.md");
  if (!fs.existsSync(pipelinePath)) {
    writeFileAtomic(
      pipelinePath,
      `# Pipeline — ${opts.name}\n\n| Deal | Stage | Value | Currency | Probability | Close Date | Updated | Notes |\n|---|---|---|---|---|---|---|---|\n`
    );
  }

  // Create sources.json
  const sourcesPath = path.join(dir, "sources.json");
  if (!fs.existsSync(sourcesPath)) {
    const gmailQuery = opts.domain
      ? `from:${opts.domain} OR to:${opts.domain}`
      : opts.email
        ? `from:${opts.email} OR to:${opts.email}`
        : "";
    const sources = {
      gmail: {
        type: "gmail",
        query: gmailQuery,
        enabled: true,
      },
      version: 1,
      created: new Date().toISOString(),
    };
    writeJsonFile(sourcesPath, sources);
  }

  return { id, dir };
}

export const createCommand = new Command("create")
  .description("Create a new customer")
  .argument("<name>", "Customer name")
  .option("--domain <domain>", "Primary domain (for Gmail sync)")
  .option("--email <email>", "Primary contact email")
  .action(async (name: string, opts: { domain?: string; email?: string }) => {
    try {
      const { id, dir } = await createCustomer({ name, ...opts });
      console.log(success(`✓ Created customer: ${bold(id)}`));
      console.log(`  Dir: ${dir}`);
      console.log(`  Files: main_facts.md, interactions.md, pipeline.md, sources.json`);
    } catch (err) {
      console.error(error(`✗ ${(err as Error).message}`));
      process.exit(1);
    }
  });
