#!/usr/bin/env tsx
/**
 * Doc link checker (#71): resolves every relative markdown link and anchor in
 * README.md + docs *.md (recursively, incl. docs/research). External http(s)
 * links are NOT fetched — this is an offline, CI-friendly structural check.
 *
 * Checks:
 *  - relative file targets exist (path resolved from the containing file)
 *  - intra-doc anchors (#foo) and anchors on relative targets resolve to a
 *    heading in the target file (GitHub slugger rules, incl. duplicate -n)
 *
 * Exit code 1 with a findings list when anything is broken.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function collectMarkdownFiles(): string[] {
  const files = [path.join(ROOT, "README.md")];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".md")) files.push(p);
    }
  };
  walk(path.join(ROOT, "docs"));
  return files;
}

/** GitHub-style heading → anchor slug (lowercase, strip punctuation, dashes). */
function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[̀-ͯ]/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → text
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}

function anchorsOf(file: string): Set<string> {
  const anchors = new Set<string>();
  const counts = new Map<string, number>();
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const m = line.match(/^#{1,6}\s+(.*)$/);
    if (!m) continue;
    const base = githubSlug(m[1]!);
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}

interface Finding {
  file: string;
  link: string;
  reason: string;
}

function checkFile(file: string, anchorCache: Map<string, Set<string>>): Finding[] {
  const findings: Finding[] = [];
  const content = fs.readFileSync(file, "utf-8");
  // Strip fenced code blocks — links there are examples, not navigation.
  const withoutCode = content.replace(/```[\s\S]*?```/g, "");
  const linkRe = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const m of withoutCode.matchAll(linkRe)) {
    const raw = m[1]!;
    if (/^(https?|mailto|tel):/.test(raw)) continue; // external — out of scope
    const [target, anchor] = raw.split("#") as [string, string | undefined];
    const targetPath = target === "" ? file : path.resolve(path.dirname(file), target);
    if (target !== "" && !fs.existsSync(targetPath)) {
      findings.push({ file, link: raw, reason: "target does not exist" });
      continue;
    }
    if (anchor !== undefined && targetPath.endsWith(".md")) {
      if (!anchorCache.has(targetPath)) anchorCache.set(targetPath, anchorsOf(targetPath));
      if (!anchorCache.get(targetPath)!.has(anchor.toLowerCase())) {
        findings.push({ file, link: raw, reason: `anchor #${anchor} not found` });
      }
    }
  }
  return findings;
}

const anchorCache = new Map<string, Set<string>>();
const findings = collectMarkdownFiles().flatMap((f) => checkFile(f, anchorCache));

if (findings.length > 0) {
  console.error(`✗ ${findings.length} broken doc link(s):\n`);
  for (const f of findings) {
    console.error(`  ${path.relative(ROOT, f.file)} → (${f.link}) — ${f.reason}`);
  }
  process.exit(1);
}
console.log("✓ all relative doc links and anchors resolve");
