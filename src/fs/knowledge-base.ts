import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { KbArticleSchema, type KbArticle, type KbArticleMeta } from "../schemas/kb-article.js";

export function kbDir(dataDir: string): string {
  return path.join(dataDir, ".agentic", "knowledge-base");
}

export function listKbArticles(dataDir: string, opts?: { category?: string; publicOnly?: boolean }): KbArticle[] {
  const dir = kbDir(dataDir);
  if (!fs.existsSync(dir)) return [];

  const results: KbArticle[] = [];
  const categories = fs.readdirSync(dir).filter((f) => {
    try { return fs.statSync(path.join(dir, f)).isDirectory(); } catch { return false; }
  });

  for (const cat of categories) {
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
  const all = listKbArticles(dataDir);
  return all.find((a) => a.id === id) ?? null;
}

export function writeKbArticle(dataDir: string, article: KbArticle): void {
  const dir = path.join(kbDir(dataDir), article.category);
  fs.mkdirSync(dir, { recursive: true });
  const { body, ...meta } = article;
  const content = matter.stringify(body, meta as Record<string, unknown>);
  fs.writeFileSync(path.join(dir, `${article.id}.md`), content, "utf-8");
}

export function deleteKbArticle(dataDir: string, id: string): boolean {
  const all = listKbArticles(dataDir);
  const article = all.find((a) => a.id === id);
  if (!article) return false;
  const p = path.join(kbDir(dataDir), article.category, `${id}.md`);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}

export function searchKbSimple(dataDir: string, query: string, opts?: { publicOnly?: boolean }): KbArticle[] {
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
