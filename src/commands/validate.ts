import { Command } from "commander";
import fs from "fs";
import path from "path";
import { MainFactsSchema } from "../schemas/main-facts.js";
import { listCustomerSlugs } from "../fs/customer-dir.js";
import matter from "gray-matter";
import { success, error, warning, info } from "../ui/colors.js";

const RECOVERABLE_DEFAULTS: Record<string, unknown> = {
  tags: [],
  currency: "EUR",
};

export function applyFix(
  factsPath: string,
  content: string,
  data: Record<string, unknown>
): { fixed: string[]; content: string } | null {
  const fixed: string[] = [];
  const patched = { ...data };

  for (const [field, defaultValue] of Object.entries(RECOVERABLE_DEFAULTS)) {
    if (patched[field] === undefined || patched[field] === null) {
      patched[field] = defaultValue;
      fixed.push(`${field} → ${JSON.stringify(defaultValue)}`);
    }
  }

  if (patched["updated"] === undefined && patched["created"]) {
    patched["updated"] = patched["created"];
    fixed.push(`updated → ${String(patched["created"])}`);
  }

  if (fixed.length === 0) return null;

  const parsed = matter(content);
  const newContent = matter.stringify(parsed.content, patched);
  fs.writeFileSync(factsPath, newContent);
  return { fixed, content: newContent };
}

export async function runValidate(opts: { fix?: boolean }, dataDir: string): Promise<void> {
  const customersDir = path.join(dataDir, "customers");

  if (!fs.existsSync(customersDir)) {
    console.log(warning("⚠ No customers directory found."));
    return;
  }

  const slugs = listCustomerSlugs(dataDir);

  let errorCount = 0;
  let fixedCount = 0;

  for (const slug of slugs) {
    const factsPath = path.join(customersDir, slug, "main_facts.md");
    const interactionsPath = path.join(customersDir, slug, "interactions.md");

    if (!fs.existsSync(factsPath)) {
      console.log(error(`✗ ${slug}: missing main_facts.md`));
      errorCount++;
      continue;
    }

    try {
      let content = fs.readFileSync(factsPath, "utf-8") as string;
      const { data } = matter(content);

      if (opts.fix) {
        const result = applyFix(factsPath, content, data as Record<string, unknown>);
        if (result) {
          content = result.content;
          fixedCount++;
          console.log(info(`⚙ ${slug}: fixed ${result.fixed.join(", ")}`));
        }
      }

      const { data: refetchedData } = matter(content);
      MainFactsSchema.parse(refetchedData);

      if (!fs.existsSync(interactionsPath)) {
        console.log(warning(`⚠ ${slug}: missing interactions.md`));
      } else {
        console.log(success(`✓ ${slug}`));
      }
    } catch (err) {
      console.log(error(`✗ ${slug}: ${(err as Error).message}`));
      errorCount++;
    }
  }

  if (opts.fix && fixedCount > 0) {
    console.log(info(`\n⚙ Fixed ${fixedCount} customer(s).`));
  }

  if (errorCount > 0) {
    console.error(error(`\n${errorCount} error(s) found.`));
    process.exit(1);
  } else {
    console.log(success("\n✓ All customers valid."));
  }
}

export const validateCommand = new Command("validate")
  .description("Validate all customer data against schemas")
  .option("--fix", "Auto-fix recoverable issues")
  .action(async (opts: { fix?: boolean }) => {
    await runValidate(opts, process.env["DXCRM_DATA_DIR"] ?? process.cwd());
  });
