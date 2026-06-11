import path from "path";
import { readJsonFile, writeJsonFile } from "../fs/json-store.js";

/**
 * Customer tonality (domino D8 / F2): per-customer (and global) tone profiles
 * applied automatically to generated communication. Customer profile fields
 * override the global default; the merged profile is rendered into a tone
 * instruction for the LLM (used by draft_email / sequences / journeys).
 */
export interface ToneProfile {
  formality?: string; // e.g. formal | casual | friendly
  language?: string; // e.g. de | en
  dos?: string[];
  donts?: string[];
  examples?: string[];
}

function globalPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "tone.json");
}
function customerPath(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug, "tone.json");
}

function readProfile(p: string): ToneProfile {
  return readJsonFile<ToneProfile>(p, {});
}

export function setTone(dataDir: string, profile: ToneProfile, slug?: string): void {
  const p = slug ? customerPath(dataDir, slug) : globalPath(dataDir);
  writeJsonFile(p, { ...readProfile(p), ...profile });
}

/** Effective profile: global as base, customer fields override. */
export function resolveTone(dataDir: string, slug?: string): ToneProfile {
  const global = readProfile(globalPath(dataDir));
  if (!slug) return global;
  return { ...global, ...readProfile(customerPath(dataDir, slug)) };
}

/**
 * Map a tone `language` code to an English language name for use in LLM prompts.
 * Unknown/empty codes fall back to English (the project default per the
 * English-only policy). Drives e.g. the language of internal email summaries.
 */
export function languageName(code?: string): string {
  const map: Record<string, string> = {
    en: "English",
    de: "German",
    fr: "French",
    es: "Spanish",
    it: "Italian",
    nl: "Dutch",
    pt: "Portuguese",
  };
  return (code && map[code.toLowerCase()]) || "English";
}

/** Render a tone profile into an instruction string ("" when blank). */
export function toneInstruction(profile: ToneProfile): string {
  const parts: string[] = [];
  if (profile.formality) parts.push(`tone: ${profile.formality}`);
  if (profile.language) parts.push(`language: ${profile.language}`);
  if (profile.dos && profile.dos.length) parts.push(`prefer: ${profile.dos.join(", ")}`);
  if (profile.donts && profile.donts.length) parts.push(`avoid: ${profile.donts.join(", ")}`);
  return parts.join("; ");
}
