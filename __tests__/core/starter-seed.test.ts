import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import { seedStarterContent } from "../../src/core/starter-seed.js";
import {
  STARTER_TEMPLATES,
  STARTER_SEQUENCES,
  CURRENT_STARTER_SEED_VERSION,
} from "../../src/core/starter-content.js";
import {
  listTemplates,
  getTemplate,
  writeTemplate,
  deleteTemplate,
} from "../../src/fs/template-store.js";
import { listSequences, getSequence } from "../../src/fs/sequence-store.js";
import { readAgenticConfig } from "../../src/fs/agentic-config.js";

const DATA_DIR = "/data";

beforeEach(() => {
  vol.reset();
  vol.fromJSON({});
});

describe("seedStarterContent", () => {
  it("seeds the full starter set on a fresh vault", () => {
    const result = seedStarterContent(DATA_DIR);

    expect(result.templatesSeeded).toHaveLength(STARTER_TEMPLATES.length);
    expect(result.sequencesSeeded).toHaveLength(STARTER_SEQUENCES.length);
    expect(listTemplates(DATA_DIR)).toHaveLength(STARTER_TEMPLATES.length);
    expect(listSequences(DATA_DIR)).toHaveLength(STARTER_SEQUENCES.length);
  });

  it("flags seeded content with starter:true and records state in config", () => {
    seedStarterContent(DATA_DIR);

    const tmpl = getTemplate(DATA_DIR, "starter-cold-intro");
    expect(tmpl?.starter).toBe(true);
    expect(tmpl?.language).toBe("en");

    const seq = getSequence(DATA_DIR, "starter-cold-outreach");
    expect(seq?.starter).toBe(true);

    const config = readAgenticConfig(DATA_DIR);
    expect(config.starterSeed?.version).toBe(CURRENT_STARTER_SEED_VERSION);
    expect(config.starterSeed?.templateIds).toEqual(STARTER_TEMPLATES.map((t) => t.id));
    expect(config.starterSeed?.sequenceIds).toEqual(STARTER_SEQUENCES.map((s) => s.id));
  });

  it("every seeded sequence step references a template that exists (enroll precondition)", () => {
    seedStarterContent(DATA_DIR);
    for (const seq of listSequences(DATA_DIR)) {
      for (const step of seq.steps) {
        expect(getTemplate(DATA_DIR, step.templateId)).not.toBeNull();
      }
    }
  });

  it("is idempotent: a second run writes nothing", () => {
    seedStarterContent(DATA_DIR);
    const second = seedStarterContent(DATA_DIR);
    expect(second.templatesSeeded).toEqual([]);
    expect(second.sequencesSeeded).toEqual([]);
    expect(listTemplates(DATA_DIR)).toHaveLength(STARTER_TEMPLATES.length);
  });

  it("does not resurrect a starter the user deleted", () => {
    seedStarterContent(DATA_DIR);
    expect(deleteTemplate(DATA_DIR, "starter-breakup")).toBe(true);

    seedStarterContent(DATA_DIR);
    expect(getTemplate(DATA_DIR, "starter-breakup")).toBeNull();
  });

  it("does not clobber a user's own file that happens to share a starter id", () => {
    writeTemplate(DATA_DIR, {
      id: "starter-cold-intro",
      subject: "MY OWN SUBJECT",
      category: "outreach",
      variables: [],
      language: "en",
      createdAt: "2026-01-01T00:00:00.000Z",
      body: "my own body",
    });

    const result = seedStarterContent(DATA_DIR);

    expect(result.templatesSeeded).not.toContain("starter-cold-intro");
    expect(getTemplate(DATA_DIR, "starter-cold-intro")?.subject).toBe("MY OWN SUBJECT");
    // still recorded as handled so it is never overwritten later
    expect(readAgenticConfig(DATA_DIR).starterSeed?.templateIds).toContain("starter-cold-intro");
  });

  it("seeds only newly-added ids on a version upgrade (no resurrection of deleted ones)", () => {
    // Simulate an older seed that offered every current id except one.
    const allButOne = STARTER_TEMPLATES.map((t) => t.id).filter((id) => id !== "starter-breakup");
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/config.json`]: JSON.stringify({
        version: 1,
        starterSeed: {
          version: 0,
          seededAt: "old",
          templateIds: allButOne,
          sequenceIds: STARTER_SEQUENCES.map((s) => s.id),
        },
      }),
    });

    const result = seedStarterContent(DATA_DIR);

    expect(result.templatesSeeded).toEqual(["starter-breakup"]);
    expect(result.sequencesSeeded).toEqual([]);
    expect(readAgenticConfig(DATA_DIR).starterSeed?.version).toBe(CURRENT_STARTER_SEED_VERSION);
  });
});
