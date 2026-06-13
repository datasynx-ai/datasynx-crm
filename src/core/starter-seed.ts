import { getTemplate, writeTemplate } from "../fs/template-store.js";
import { getSequence, writeSequence } from "../fs/sequence-store.js";
import { readAgenticConfig, writeAgenticConfig } from "../fs/agentic-config.js";
import {
  STARTER_TEMPLATES,
  STARTER_SEQUENCES,
  CURRENT_STARTER_SEED_VERSION,
} from "./starter-content.js";

export interface SeedResult {
  templatesSeeded: string[];
  sequencesSeeded: string[];
}

/**
 * Seed the starter template/sequence set into a vault, idempotently.
 *
 * Guarantees:
 * - Each starter id is offered exactly once per vault. Deleting a seeded starter and
 *   re-running this never resurrects it (the id is recorded in `config.starterSeed`).
 * - A user's own file with a starter id is never clobbered.
 * - Bumping CURRENT_STARTER_SEED_VERSION and adding new ids seeds only the new ones.
 *
 * Returns the ids actually written this call (empty on a no-op run).
 */
export function seedStarterContent(dataDir: string): SeedResult {
  const config = readAgenticConfig(dataDir);
  const prev = config.starterSeed ?? {
    version: 0,
    seededAt: "",
    templateIds: [],
    sequenceIds: [],
  };
  const seenTemplates = new Set(prev.templateIds);
  const seenSequences = new Set(prev.sequenceIds);
  const now = new Date().toISOString();

  const templatesSeeded: string[] = [];
  for (const tmpl of STARTER_TEMPLATES) {
    if (seenTemplates.has(tmpl.id)) continue; // offered before → never resurrect
    seenTemplates.add(tmpl.id); // record as handled even if a user file pre-exists
    if (getTemplate(dataDir, tmpl.id)) continue; // do not clobber a user's file
    writeTemplate(dataDir, { ...tmpl, createdAt: now });
    templatesSeeded.push(tmpl.id);
  }

  const sequencesSeeded: string[] = [];
  for (const seq of STARTER_SEQUENCES) {
    if (seenSequences.has(seq.id)) continue;
    seenSequences.add(seq.id);
    if (getSequence(dataDir, seq.id)) continue;
    writeSequence(dataDir, { ...seq, createdAt: now });
    sequencesSeeded.push(seq.id);
  }

  const grew =
    seenTemplates.size > prev.templateIds.length || seenSequences.size > prev.sequenceIds.length;
  if (grew || prev.version !== CURRENT_STARTER_SEED_VERSION) {
    config.starterSeed = {
      version: CURRENT_STARTER_SEED_VERSION,
      seededAt: now,
      templateIds: [...seenTemplates],
      sequenceIds: [...seenSequences],
    };
    writeAgenticConfig(dataDir, config);
  }

  return { templatesSeeded, sequencesSeeded };
}
