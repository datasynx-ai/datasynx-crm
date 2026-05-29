import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { EmailTemplateSchema, type EmailTemplate } from "../schemas/email-template.js";

export function templatesDir(dataDir: string): string {
  return path.join(dataDir, ".agentic", "templates");
}

function templatePath(dataDir: string, category: string, id: string): string {
  return path.join(templatesDir(dataDir), category, `${id}.md`);
}

function parseTemplateFile(filePath: string, id: string): EmailTemplate | null {
  try {
    const raw = matter(fs.readFileSync(filePath, "utf-8"));
    const result = EmailTemplateSchema.safeParse({ id, createdAt: new Date().toISOString(), ...raw.data });
    if (!result.success) return null;
    return { ...result.data, body: raw.content.trim() };
  } catch {
    return null;
  }
}

export function listTemplates(dataDir: string, opts?: { category?: string }): EmailTemplate[] {
  const base = templatesDir(dataDir);
  if (!fs.existsSync(base)) return [];
  const results: EmailTemplate[] = [];

  const categories = fs.readdirSync(base).filter((name) => {
    try { return fs.statSync(path.join(base, name)).isDirectory(); } catch { return false; }
  });

  for (const cat of categories) {
    if (opts?.category && cat !== opts.category) continue;
    const catDir = path.join(base, cat);
    const files = fs.readdirSync(catDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const id = file.replace(/\.md$/, "");
      const tmpl = parseTemplateFile(path.join(catDir, file), id);
      if (tmpl) results.push(tmpl);
    }
  }
  return results;
}

export function getTemplate(dataDir: string, id: string): EmailTemplate | null {
  const base = templatesDir(dataDir);
  if (!fs.existsSync(base)) return null;

  // Search all categories
  const categories = fs.existsSync(base)
    ? fs.readdirSync(base).filter((n) => {
        try { return fs.statSync(path.join(base, n)).isDirectory(); } catch { return false; }
      })
    : [];

  for (const cat of categories) {
    const p = path.join(base, cat, `${id}.md`);
    if (fs.existsSync(p)) return parseTemplateFile(p, id);
  }
  return null;
}

export function writeTemplate(dataDir: string, tmpl: EmailTemplate): void {
  const { body, ...meta } = tmpl;
  const category = meta.category ?? "general";
  const dir = path.join(templatesDir(dataDir), category);
  fs.mkdirSync(dir, { recursive: true });
  const content = matter.stringify(body, { ...meta, updatedAt: new Date().toISOString() });
  fs.writeFileSync(path.join(dir, `${tmpl.id}.md`), content, "utf-8");
}

export function deleteTemplate(dataDir: string, id: string): boolean {
  const tmpl = getTemplate(dataDir, id);
  if (!tmpl) return false;
  const p = path.join(templatesDir(dataDir), tmpl.category, `${id}.md`);
  if (fs.existsSync(p)) { fs.unlinkSync(p); return true; }
  return false;
}
