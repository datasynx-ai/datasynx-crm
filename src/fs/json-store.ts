import fs from "fs";
import { writeFileAtomic } from "./atomic-write.js";

/**
 * Small shared JSON persistence helpers. Many modules independently reimplemented
 * the same "read a JSON file, fall back to a default on missing/parse-error" and
 * "write a `{ key: items }` array store" logic — this centralizes both so the
 * behavior (and the silent-fallback semantics) is defined in exactly one place.
 *
 * Writes go through writeFileAtomic, so a crash mid-write can never leave a
 * half-written (corrupt) JSON file — readers always see either the old or the
 * new complete document. This matters for the config, audit, and state files
 * the whole product depends on.
 */

/** Read and parse a JSON file, returning `fallback` if it is missing or invalid. */
export function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8") as string) as T;
  } catch {
    return fallback;
  }
}

/** Atomically write `value` as pretty-printed JSON, creating parent dirs as needed. */
export function writeJsonFile(filePath: string, value: unknown): void {
  writeFileAtomic(filePath, JSON.stringify(value, null, 2));
}

/**
 * Read an array stored under `key` in a `{ [key]: T[] }` JSON document. Returns
 * an empty array if the file is missing, unparsable, or the key is not an array.
 */
export function readJsonArray<T>(filePath: string, key: string): T[] {
  const data = readJsonFile<Record<string, unknown>>(filePath, {});
  const arr = data[key];
  return Array.isArray(arr) ? (arr as T[]) : [];
}

/** Write an array under `key` as a `{ [key]: items }` JSON document. */
export function writeJsonArray<T>(filePath: string, key: string, items: T[]): void {
  writeJsonFile(filePath, { [key]: items });
}
