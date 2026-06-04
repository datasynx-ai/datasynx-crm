import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { KbArticleSchema, type KbArticle, type KbArticleMeta } from "../schemas/kb-article.js";

export function kbDir(dataDir: string): string {
  return path.join(dataDir, ".agentic", "knowledge-base");
}

/** Category subdirectories of the knowledge base. */
function kbCategories(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => {
    try {
      return fs.statSync(path.join(dir, f)).isDirectory();
    } catch {
      return false;
    }
  });
}

export function listKbArticles(
  dataDir: string,
  opts?: { category?: string; publicOnly?: boolean }
): KbArticle[] {
  const dir = kbDir(dataDir);
  const results: KbArticle[] = [];

  for (const cat of kbCategories(dir)) {
    const catDir = path.join(dir, cat);
    const files = fs.readdirSync(catDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(catDir, file), "utf-8") as string;
        const parsed = matter(content);
        const meta = KbArticleSchema.safeParse(parsed.data);
        if (!meta.success) continue;
        if (opts?.category && meta.data.category !== opts.category) continue;
        if (opts?.publicOnly && !meta.data.public) continue;
        results.push({ ...meta.data, body: parsed.content.trim() });
      } catch {
        continue;
      }
    }
  }

  return results;
}

export function getKbArticle(dataDir: string, id: string): KbArticle | null {
  // Articles are stored as <category>/<id>.md, so locate the file directly
  // instead of parsing the whole knowledge base to find one by id.
  const dir = kbDir(dataDir);
  for (const cat of kbCategories(dir)) {
    const filePath = path.join(dir, cat, `${id}.md`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const parsed = matter(fs.readFileSync(filePath, "utf-8") as string);
      const meta = KbArticleSchema.safeParse(parsed.data);
      if (!meta.success) return null;
      return { ...meta.data, body: parsed.content.trim() };
    } catch {
      return null;
    }
  }
  return null;
}

export function writeKbArticle(dataDir: string, article: KbArticle): void {
  const dir = path.join(kbDir(dataDir), article.category);
  fs.mkdirSync(dir, { recursive: true });
  const { body, ...meta } = article;
  const content = matter.stringify(body, meta as Record<string, unknown>);
  fs.writeFileSync(path.join(dir, `${article.id}.md`), content, "utf-8");
}

export function deleteKbArticle(dataDir: string, id: string): boolean {
  // Locate <category>/<id>.md directly rather than parsing every article.
  const dir = kbDir(dataDir);
  for (const cat of kbCategories(dir)) {
    const p = path.join(dir, cat, `${id}.md`);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      return true;
    }
  }
  return false;
}

export function searchKbSimple(
  dataDir: string,
  query: string,
  opts?: { publicOnly?: boolean }
): KbArticle[] {
  const all = listKbArticles(dataDir, opts?.publicOnly ? { publicOnly: true } : {});
  const lower = query.toLowerCase();
  return all.filter(
    (a) =>
      a.title.toLowerCase().includes(lower) ||
      a.body.toLowerCase().includes(lower) ||
      a.tags.some((t) => t.toLowerCase().includes(lower))
  );
}

export function getKbMetaForExport(article: KbArticle): KbArticleMeta {
  const { body: _body, ...meta } = article;
  return meta;
}
