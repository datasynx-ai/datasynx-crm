import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";

// fs is mocked globally via __tests__/setup.ts (memfs).
beforeEach(() => vol.reset());

const DATA = "/crm";

function entry(date: string, summary: string): string {
  return `## ${date} · Email\n**Subject:** ${summary}\n**Summary:** ${summary}\n**Source:** ref://${date}\n**Synced:** ${date}T00:00:00Z\n---\n`;
}

function seed(entries: string[]): void {
  vol.fromJSON({
    "/crm/customers/acme/interactions.md": `# Interactions\n\n${entries.join("\n")}`,
  });
}

describe("archiveInteractions", () => {
  it("returns a no-op when the file does not exist", async () => {
    const { archiveInteractions } = await import("../../src/core/archive.js");
    const res = await archiveInteractions(DATA, "ghost", { keep: 1 });
    expect(res).toEqual({ archived: 0, kept: 0, files: [] });
  });

  it("keeps the newest N entries and archives the rest by year", async () => {
    // Newest-first order, like the real interactions.md.
    seed([
      entry("2026-06-01", "june deal"),
      entry("2026-05-01", "may call"),
      entry("2025-12-15", "december email"),
      entry("2025-11-01", "november note"),
    ]);

    const { archiveInteractions } = await import("../../src/core/archive.js");
    const res = await archiveInteractions(DATA, "acme", { keep: 2 });

    expect(res.archived).toBe(2);
    expect(res.kept).toBe(2);

    const { fs } = vol as unknown as { fs: typeof import("fs") };
    const hot = fs.readFileSync("/crm/customers/acme/interactions.md", "utf-8") as string;
    expect(hot).toContain("# Interactions");
    expect(hot).toContain("june deal");
    expect(hot).toContain("may call");
    expect(hot).not.toContain("december email");
    expect(hot).not.toContain("november note");

    // Archived entries grouped into the 2025 year file, still readable.
    const archive2025 = fs.readFileSync(
      "/crm/customers/acme/interactions-archive/2025.md",
      "utf-8"
    ) as string;
    expect(archive2025).toContain("december email");
    expect(archive2025).toContain("november note");
    expect(res.files).toContain("customers/acme/interactions-archive/2025.md");
  });

  it("archives entries strictly older than --before", async () => {
    seed([entry("2026-06-01", "recent"), entry("2026-01-01", "old one")]);

    const { archiveInteractions } = await import("../../src/core/archive.js");
    const res = await archiveInteractions(DATA, "acme", { before: "2026-03-01" });

    expect(res.archived).toBe(1);
    const { fs } = vol as unknown as { fs: typeof import("fs") };
    const hot = fs.readFileSync("/crm/customers/acme/interactions.md", "utf-8") as string;
    expect(hot).toContain("recent");
    expect(hot).not.toContain("old one");
  });

  it("is a no-op when nothing is old enough to archive", async () => {
    seed([entry("2026-06-01", "recent")]);
    const { archiveInteractions } = await import("../../src/core/archive.js");
    const res = await archiveInteractions(DATA, "acme", { keep: 10 });
    expect(res.archived).toBe(0);
    expect(res.files).toEqual([]);
  });

  it("appends to an existing year archive instead of overwriting", async () => {
    vol.fromJSON({
      "/crm/customers/acme/interactions-archive/2025.md":
        "# Interactions Archive 2025\n\n## 2025-01-01 · Email\n**Summary:** existing archived\n---\n",
      "/crm/customers/acme/interactions.md": `# Interactions\n\n${entry("2025-09-01", "newly archived")}`,
    });
    const { archiveInteractions } = await import("../../src/core/archive.js");
    await archiveInteractions(DATA, "acme", { keep: 0 });

    const { fs } = vol as unknown as { fs: typeof import("fs") };
    const archive = fs.readFileSync(
      "/crm/customers/acme/interactions-archive/2025.md",
      "utf-8"
    ) as string;
    expect(archive).toContain("existing archived");
    expect(archive).toContain("newly archived");
  });
});
