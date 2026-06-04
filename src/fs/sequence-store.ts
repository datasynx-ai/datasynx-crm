import fs from "fs";
import path from "path";
import { writeFileAtomic } from "./atomic-write.js";
import yaml from "js-yaml";
import { withJsonFile } from "../core/file-lock.js";
import {
  SequenceSchema,
  SequenceEnrollmentSchema,
  type Sequence,
  type SequenceEnrollment,
} from "../schemas/sequence.js";

export function sequencesDir(dataDir: string): string {
  return path.join(dataDir, ".agentic", "sequences");
}

export function enrollmentsPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "sequence-enrollments.json");
}

export function listSequences(dataDir: string): Sequence[] {
  const dir = sequencesDir(dataDir);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml"));
  const results: Sequence[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), "utf-8") as string;
      const raw = yaml.load(content);
      const parsed = SequenceSchema.safeParse(raw);
      if (parsed.success) {
        results.push(parsed.data);
      }
    } catch {
      // skip invalid files
    }
  }

  return results;
}

export function getSequence(dataDir: string, id: string): Sequence | null {
  const sequences = listSequences(dataDir);
  return sequences.find((s) => s.id === id) ?? null;
}

export function writeSequence(dataDir: string, seq: Sequence): void {
  const dir = sequencesDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const content = yaml.dump(seq);
  writeFileAtomic(path.join(dir, `${seq.id}.yaml`), content);
}

export function readEnrollments(dataDir: string): SequenceEnrollment[] {
  const p = enrollmentsPath(dataDir);
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8") as string) as unknown;
    return Array.isArray(raw) ? (raw as SequenceEnrollment[]) : [];
  } catch {
    return [];
  }
}

export async function writeEnrollment(
  dataDir: string,
  enrollment: SequenceEnrollment
): Promise<void> {
  await withJsonFile<SequenceEnrollment[]>(enrollmentsPath(dataDir), (current) => {
    const existing = Array.isArray(current) ? current : [];
    return [...existing, enrollment];
  });
}

export async function updateEnrollment(
  dataDir: string,
  id: string,
  updates: Partial<SequenceEnrollment>
): Promise<SequenceEnrollment | null> {
  let updated: SequenceEnrollment | null = null;

  await withJsonFile<SequenceEnrollment[]>(enrollmentsPath(dataDir), (current) => {
    const existing = Array.isArray(current) ? current : [];
    const idx = existing.findIndex((e) => e.id === id);
    if (idx < 0) return existing;

    const merged = SequenceEnrollmentSchema.parse({ ...existing[idx], ...updates });
    updated = merged;
    const next = [...existing];
    next[idx] = merged;
    return next;
  });

  return updated;
}
