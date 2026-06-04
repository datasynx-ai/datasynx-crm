import path from "path";
import { readJsonFile, writeJsonFile } from "./json-store.js";

export interface UnmatchedTranscript {
  filePath: string;
  addedAt: string; // ISO timestamp
  reason: "no_customer_match" | "no_customers_defined";
}

function getUnmatchedPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "unmatched-transcripts.json");
}

export function readUnmatched(dataDir: string): UnmatchedTranscript[] {
  return readJsonFile<UnmatchedTranscript[]>(getUnmatchedPath(dataDir), []);
}

export function appendUnmatched(dataDir: string, entry: UnmatchedTranscript): void {
  writeJsonFile(getUnmatchedPath(dataDir), [...readUnmatched(dataDir), entry]);
}

export function clearUnmatched(dataDir: string): void {
  writeJsonFile(getUnmatchedPath(dataDir), []);
}
