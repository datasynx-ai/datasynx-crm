#!/usr/bin/env tsx
/**
 * Language-policy checker (#80): enforces the English-only policy from CLAUDE.md
 * by flagging common German stopwords in tracked text files. Like check-doc-links.ts
 * this is an offline, CI-friendly check — no network, Node built-ins only.
 *
 * Why stopwords (not umlauts / a dictionary): grammatical function words like
 * "und"/"nicht"/"für" appear in German *prose* but never in proper names,
 * identifiers, or the project's intentional bilingual keyword tables — so a
 * curated stopword list catches reintroduced German text with near-zero false
 * positives. The list deliberately excludes German/English homographs
 * (war, die, man, was, hat, den, …).
 *
 * Allowlist (legitimate German):
 *  - per-line inline marker `i18n-allow`
 *  - path allowlist below (intentional bilingual domain keywords + this checker)
 *
 * Exit code 1 with a findings list when German stopwords are found.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * Curated common German stopwords (grammatical function words). Whole-word,
 * case-insensitive. Excludes homographs that are also valid English words
 * (war, die, man, was, hat, den, der, in, so, bin, ...).
 */
export const GERMAN_STOPWORDS: string[] = [
  "und",
  "oder",
  "nicht",
  "kein",
  "keine",
  "keinen",
  "keiner",
  "keinem",
  "für",
  "über",
  "wird",
  "werden",
  "wurde",
  "wurden",
  "muss",
  "müssen",
  "müsste",
  "soll",
  "sollen",
  "sollte",
  "eine",
  "einen",
  "einem",
  "einer",
  "eines",
  "zum",
  "zur",
  "beim",
  "vom",
  "durch",
  "gegen",
  "ohne",
  "weil",
  "dass",
  "auch",
  "noch",
  "schon",
  "sehr",
  "mehr",
  "jede",
  "jeder",
  "jedes",
  "sich",
  "wir",
  "ihre",
  "ihren",
  "ist",
  "sind",
  "seine",
  "seinen",
  "haben",
  "hatte",
  "deshalb",
  "außerdem",
  "zwischen",
  "während",
  "gemäß",
  "nämlich",
  "damit",
  "dafür",
  "dabei",
  "dadurch",
  "sowie",
  "jedoch",
  "allerdings",
  "bereits",
  "würde",
  "könnte",
  "wären",
  "vorhanden",
  "verfügbar",
];

const STOPWORD_SET = new Set(GERMAN_STOPWORDS.map((w) => w.toLowerCase()));

/**
 * File paths (relative to repo root) exempt from the check. These hold
 * intentional German: the product's bilingual detection keyword tables and this
 * checker itself (which embeds the stopword list as string literals).
 */
const ALLOWLIST_PATHS = new Set<string>([
  "scripts/check-language.ts",
  "__tests__/scripts/check-language.test.ts",
  // Bilingual detection: German CRM-log sentiment & stakeholder-role keywords.
  // Translating/removing these is a behavior change (#80 keeps them; see plan).
  "src/core/deal-health.ts",
  "src/core/role-detection.ts",
  // Legally-required localized user-facing output: the German EU-AI-Act Art. 50
  // disclosure string (de locale). Must remain German for German-locale users.
  "src/core/compliance.ts",
  // Migration record that necessarily quotes the German content it documents.
  "docs/research/2026-06-11-issue-80-english-only-policy.md",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".md",
  ".json",
  ".yml",
  ".yaml",
  ".txt",
]);

export interface StopwordFinding {
  line: number;
  word: string;
  text: string;
}

/** Find German stopwords in a text blob. Lines containing `i18n-allow` are skipped. */
export function findStopwords(content: string): StopwordFinding[] {
  const findings: StopwordFinding[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes("i18n-allow")) continue;
    // Tokenize into Unicode-letter words (handles umlauts; splits hyphens/punctuation).
    const tokens = line.toLowerCase().match(/[\p{L}]+/gu);
    if (!tokens) continue;
    const seen = new Set<string>();
    for (const tok of tokens) {
      if (STOPWORD_SET.has(tok) && !seen.has(tok)) {
        seen.add(tok);
        findings.push({ line: i + 1, word: tok, text: line.trim() });
      }
    }
  }
  return findings;
}

function trackedTextFiles(): string[] {
  const out = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf-8" });
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => TEXT_EXTENSIONS.has(path.extname(f)))
    .filter((f) => path.basename(f) !== "package-lock.json")
    .filter((f) => !ALLOWLIST_PATHS.has(f));
}

function main(): void {
  const files = trackedTextFiles();
  const findings: Array<{ file: string; finding: StopwordFinding }> = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(ROOT, file), "utf-8");
    for (const finding of findStopwords(content)) {
      findings.push({ file, finding });
    }
  }

  if (findings.length > 0) {
    console.error(
      `✗ ${findings.length} German stopword finding(s) — English-only policy (CLAUDE.md):\n`
    );
    for (const { file, finding } of findings) {
      console.error(`  ${file}:${finding.line} — "${finding.word}" — ${finding.text}`);
    }
    console.error(
      `\nTranslate the content to English, or append \`i18n-allow\` to the line / add the file` +
        ` to ALLOWLIST_PATHS in scripts/check-language.ts if the German is intentional.`
    );
    process.exit(1);
  }
  console.log(`✓ no German stopwords found in ${files.length} tracked text files`);
}

// Run only when invoked directly (not when imported by the unit test).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
