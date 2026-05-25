import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { fromZodError } from "zod-validation-error";
import { MainFactsSchema, type MainFacts } from "../schemas/main-facts.js";

export function getCustomerDir(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug);
}

export function customerExists(dataDir: string, slug: string): boolean {
  return fs.existsSync(getCustomerDir(dataDir, slug));
}

export async function ensureCustomerDir(dataDir: string, slug: string): Promise<void> {
  const customerDir = getCustomerDir(dataDir, slug);
  fs.mkdirSync(customerDir, { recursive: true });
  fs.mkdirSync(path.join(customerDir, "attachments"), { recursive: true });
  fs.mkdirSync(path.join(customerDir, "transcripts"), { recursive: true });
}

export async function writeMainFacts(
  dataDir: string,
  slug: string,
  facts: MainFacts
): Promise<void> {
  const filePath = path.join(getCustomerDir(dataDir, slug), "main_facts.md");
  // Stringify via gray-matter: write frontmatter + empty body
  const content = matter.stringify("", facts as Record<string, unknown>);
  fs.writeFileSync(filePath, content, "utf-8");
}

export async function readMainFacts(dataDir: string, slug: string): Promise<MainFacts> {
  const filePath = path.join(getCustomerDir(dataDir, slug), "main_facts.md");
  if (!fs.existsSync(filePath)) {
    throw new Error(`main_facts.md not found for customer '${slug}'`);
  }
  // Use fs.readFileSync so the memfs mock is respected in tests,
  // then parse the string with matter.
  const content = fs.readFileSync(filePath, "utf-8") as string;
  const raw = matter(content);
  const result = MainFactsSchema.safeParse(raw.data);
  if (!result.success) {
    throw new Error(
      fromZodError(result.error, {
        prefix: `Schema error in ${filePath}`,
        prefixSeparator: ":\n  - ",
        issueSeparator: "\n  - ",
      }).message
    );
  }
  return result.data;
}
