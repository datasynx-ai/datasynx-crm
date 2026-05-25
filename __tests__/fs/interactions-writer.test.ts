import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import {
  appendInteraction,
  readInteractions,
  formatInteractionEntry,
} from "../../src/fs/interactions-writer.js";
import type { InteractionEntry } from "../../src/schemas/interaction.js";

const DATA_DIR = "/data";
const SLUG = "acme-corp";
const CUSTOMER_DIR = `${DATA_DIR}/customers/${SLUG}`;

beforeEach(() => {
  vol.reset();
  // Pre-create customer directory with empty interactions.md
  vol.fromJSON({
    [`${CUSTOMER_DIR}/interactions.md`]:
      "# Interactions — Acme Corp\n\n<!-- Newest entries first -->\n",
  });
});

const entry1: InteractionEntry = {
  date: "2024-06-01",
  type: "Email",
  with: "max@acme.com",
  summary: "Discussed pricing options. They seem interested in the enterprise plan.",
  nextSteps: ["Send pricing sheet", "Follow up next week"],
  sourceRef: "gmail://thread/abc123",
  synced: "2024-06-01T10:00:00.000Z",
};

const entry2: InteractionEntry = {
  date: "2024-06-05",
  type: "Call",
  with: "Max Mustermann",
  summary: "30-minute call about implementation timeline. They want to start in Q3.",
  nextSteps: ["Create project timeline"],
  sourceRef: "agent://log/1234567890",
  synced: "2024-06-05T14:30:00.000Z",
};

describe("formatInteractionEntry", () => {
  it("includes date and type in header", () => {
    const formatted = formatInteractionEntry(entry1);
    expect(formatted).toContain("## 2024-06-01 · Email");
  });

  it("includes direction in header when provided", () => {
    const formatted = formatInteractionEntry({ ...entry1, direction: "inbound" });
    expect(formatted).toContain("## 2024-06-01 · Email · inbound");
  });

  it("uses 'Subject' label for Email type", () => {
    const formatted = formatInteractionEntry(entry1);
    expect(formatted).toContain("**Subject:** max@acme.com");
  });

  it("uses 'With' label for non-Email types", () => {
    const formatted = formatInteractionEntry(entry2);
    expect(formatted).toContain("**With:** Max Mustermann");
  });

  it("includes summary", () => {
    const formatted = formatInteractionEntry(entry1);
    expect(formatted).toContain("**Summary:** Discussed pricing options.");
  });

  it("formats next steps as checkboxes", () => {
    const formatted = formatInteractionEntry(entry1);
    expect(formatted).toContain("- [ ] Send pricing sheet");
    expect(formatted).toContain("- [ ] Follow up next week");
  });

  it("uses placeholder when no next steps", () => {
    const formatted = formatInteractionEntry({ ...entry1, nextSteps: [] });
    expect(formatted).toContain("- [ ] —");
  });

  it("includes source ref", () => {
    const formatted = formatInteractionEntry(entry1);
    expect(formatted).toContain("**Source:** gmail://thread/abc123");
  });

  it("includes synced timestamp", () => {
    const formatted = formatInteractionEntry(entry1);
    expect(formatted).toContain("**Synced:** 2024-06-01T10:00:00.000Z");
  });

  it("ends with separator", () => {
    const formatted = formatInteractionEntry(entry1);
    expect(formatted).toContain("---");
  });
});

describe("readInteractions", () => {
  it("returns raw markdown string", async () => {
    const content = await readInteractions(DATA_DIR, SLUG);
    expect(typeof content).toBe("string");
    expect(content).toContain("# Interactions");
  });

  it("returns empty string when file does not exist", async () => {
    vol.reset();
    vol.fromJSON({ [`${CUSTOMER_DIR}/`]: null });
    const content = await readInteractions(DATA_DIR, SLUG);
    expect(content).toBe("");
  });
});

describe("appendInteraction", () => {
  it("prepends entry at top (after header)", async () => {
    await appendInteraction(DATA_DIR, SLUG, entry1);
    const content = await readInteractions(DATA_DIR, SLUG);
    // Entry should appear before other content, after header
    const headerEnd = content.indexOf("\n\n");
    const afterHeader = content.slice(headerEnd + 2);
    expect(afterHeader).toContain("## 2024-06-01 · Email");
  });

  it("newest entry appears first (prepend order)", async () => {
    await appendInteraction(DATA_DIR, SLUG, entry1);
    await appendInteraction(DATA_DIR, SLUG, entry2);
    const content = await readInteractions(DATA_DIR, SLUG);
    const pos1 = content.indexOf("2024-06-01");
    const pos2 = content.indexOf("2024-06-05");
    // entry2 (newer date, added second) should be before entry1
    expect(pos2).toBeLessThan(pos1);
  });

  it("creates interactions.md if it does not exist", async () => {
    vol.reset();
    // Only the customer dir exists, no interactions.md
    vol.mkdirSync(CUSTOMER_DIR, { recursive: true });
    await appendInteraction(DATA_DIR, SLUG, entry1);
    const content = await readInteractions(DATA_DIR, SLUG);
    expect(content).toContain("## 2024-06-01 · Email");
  });

  it("preserves existing entries when prepending", async () => {
    await appendInteraction(DATA_DIR, SLUG, entry1);
    await appendInteraction(DATA_DIR, SLUG, entry2);
    const content = await readInteractions(DATA_DIR, SLUG);
    expect(content).toContain("2024-06-01");
    expect(content).toContain("2024-06-05");
  });

  it("includes all formatted fields in output", async () => {
    await appendInteraction(DATA_DIR, SLUG, entry1);
    const content = await readInteractions(DATA_DIR, SLUG);
    expect(content).toContain("**Summary:**");
    expect(content).toContain("**Next Steps:**");
    expect(content).toContain("**Source:**");
    expect(content).toContain("**Synced:**");
  });
});
