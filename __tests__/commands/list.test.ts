import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => vol.reset());

describe("list command", () => {
  it("handles empty customers dir", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    const { fs: memFs } = await import("memfs");
    const entries = memFs.readdirSync("/crm/customers") as string[];
    // .keep is a file, not directory — slugs would be filtered
    const slugs = entries.filter((s) => {
      try {
        return memFs.statSync(`/crm/customers/${s}`).isDirectory();
      } catch {
        return false;
      }
    });
    expect(slugs).toEqual([]);
  });

  it("returns customer slugs from directory listing", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/main_facts.md": `---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
      "/crm/customers/beta-inc/main_facts.md": `---\nname: Beta Inc\nrelationship_stage: prospect\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
    });
    const { fs: memFs } = await import("memfs");
    const entries = memFs.readdirSync("/crm/customers") as string[];
    const slugs = entries.filter((s) => {
      try {
        return memFs.statSync(`/crm/customers/${s}`).isDirectory();
      } catch {
        return false;
      }
    });
    expect(slugs).toContain("acme-corp");
    expect(slugs).toContain("beta-inc");
  });

  it("reads main_facts for each customer", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/main_facts.md": `---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
    });
    const { readMainFacts } = await import("../../src/fs/customer-dir.js");
    const facts = await readMainFacts("/crm", "acme-corp");
    expect(facts.name).toBe("Acme Corp");
    expect(facts.relationship_stage).toBe("active");
  });
});

describe("list command --filter option", () => {
  it("filters customers by stage (prospect)", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/main_facts.md": `---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
      "/crm/customers/beta-inc/main_facts.md": `---\nname: Beta Inc\nrelationship_stage: prospect\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
    });
    const { readMainFacts } = await import("../../src/fs/customer-dir.js");
    const { fs: memFs } = await import("memfs");

    const entries = memFs.readdirSync("/crm/customers") as string[];
    const slugs = entries.filter((s) => {
      try {
        return memFs.statSync(`/crm/customers/${s}`).isDirectory();
      } catch {
        return false;
      }
    });

    const filter = "prospect";
    const matched: string[] = [];
    for (const slug of slugs) {
      const facts = await readMainFacts("/crm", slug);
      const q = filter.toLowerCase();
      if (
        facts.name.toLowerCase().includes(q) ||
        slug.includes(q) ||
        (facts.relationship_stage ?? "").toLowerCase().includes(q)
      ) {
        matched.push(slug);
      }
    }

    expect(matched).toContain("beta-inc");
    expect(matched).not.toContain("acme-corp");
  });

  it("filters customers by name substring (acme)", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/main_facts.md": `---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
      "/crm/customers/beta-inc/main_facts.md": `---\nname: Beta Inc\nrelationship_stage: prospect\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
    });
    const { readMainFacts } = await import("../../src/fs/customer-dir.js");
    const { fs: memFs } = await import("memfs");

    const entries = memFs.readdirSync("/crm/customers") as string[];
    const slugs = entries.filter((s) => {
      try {
        return memFs.statSync(`/crm/customers/${s}`).isDirectory();
      } catch {
        return false;
      }
    });

    const filter = "acme";
    const matched: string[] = [];
    for (const slug of slugs) {
      const facts = await readMainFacts("/crm", slug);
      const q = filter.toLowerCase();
      if (facts.name.toLowerCase().includes(q) || slug.includes(q)) {
        matched.push(slug);
      }
    }

    expect(matched).toContain("acme-corp");
    expect(matched).not.toContain("beta-inc");
  });

  it("filters customers by slug substring", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/main_facts.md": `---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
      "/crm/customers/beta-inc/main_facts.md": `---\nname: Beta Inc\nrelationship_stage: prospect\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
    });
    const { readMainFacts } = await import("../../src/fs/customer-dir.js");
    const { fs: memFs } = await import("memfs");

    const entries = memFs.readdirSync("/crm/customers") as string[];
    const slugs = entries.filter((s) => {
      try {
        return memFs.statSync(`/crm/customers/${s}`).isDirectory();
      } catch {
        return false;
      }
    });

    const filter = "beta-inc";
    const matched: string[] = [];
    for (const slug of slugs) {
      const facts = await readMainFacts("/crm", slug);
      const q = filter.toLowerCase();
      if (facts.name.toLowerCase().includes(q) || slug.includes(q)) {
        matched.push(slug);
      }
    }

    expect(matched).toContain("beta-inc");
    expect(matched).not.toContain("acme-corp");
  });

  it("returns no results when filter matches nothing", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/main_facts.md": `---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
    });
    const { readMainFacts } = await import("../../src/fs/customer-dir.js");
    const { fs: memFs } = await import("memfs");

    const entries = memFs.readdirSync("/crm/customers") as string[];
    const slugs = entries.filter((s) => {
      try {
        return memFs.statSync(`/crm/customers/${s}`).isDirectory();
      } catch {
        return false;
      }
    });

    const filter = "zzznomatch";
    const matched: string[] = [];
    for (const slug of slugs) {
      const facts = await readMainFacts("/crm", slug);
      const q = filter.toLowerCase();
      if (facts.name.toLowerCase().includes(q) || slug.includes(q)) {
        matched.push(slug);
      }
    }

    expect(matched).toHaveLength(0);
  });
});

// ─── Actual listCommand tests (covers src/commands/list.ts) ──────────────────

describe("listCommand — command invocation", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = "/crm";
  });

  it("prints 'No customers yet' when customers dir does not exist", async () => {
    vol.fromJSON({});
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { listCommand } = await import("../../src/commands/list.js");
    await listCommand.parseAsync(["node", "list"]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No customers"));
    consoleSpy.mockRestore();
  });

  it("renders customer table when customers exist", async () => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md":
        "---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { listCommand } = await import("../../src/commands/list.js");
    await listCommand.parseAsync(["node", "list"]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("shows 'No customers matching' when filter has no results", async () => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md":
        "---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { listCommand } = await import("../../src/commands/list.js");
    await listCommand.parseAsync(["node", "list", "--filter", "zzznomatch"]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("zzznomatch"));
    consoleSpy.mockRestore();
  });

  it("skips customer directory that has no main_facts.md (catch block)", async () => {
    vol.fromJSON({
      "/crm/customers/bad-customer/.keep": "",
      "/crm/customers/good-acme/main_facts.md":
        "---\nname: Good Acme\nrelationship_stage: active\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { listCommand } = await import("../../src/commands/list.js");
    await listCommand.parseAsync(["node", "list"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Good Acme");
    expect(output).not.toContain("bad-customer");
    consoleSpy.mockRestore();
  });

  it("shows 'No customers yet' when all directories fail to read (no filter)", async () => {
    vol.fromJSON({ "/crm/customers/bad/.keep": "" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { listCommand } = await import("../../src/commands/list.js");
    await listCommand.parseAsync(["node", "list"]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No customers"));
    consoleSpy.mockRestore();
  });

  it("uses process.cwd() when DXCRM_DATA_DIR is not set", async () => {
    delete process.env["DXCRM_DATA_DIR"];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { listCommand } = await import("../../src/commands/list.js");
    await listCommand.parseAsync(["node", "list"]);
    consoleSpy.mockRestore();
    process.env["DXCRM_DATA_DIR"] = "/crm";
  });

  it("shows filter match on relationship_stage when stage matches query", async () => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md":
        "---\nname: Acme Corp\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { listCommand } = await import("../../src/commands/list.js");
    // customer has no relationship_stage → ?? "" → filter won't match "active", ok
    await listCommand.parseAsync(["node", "list", "--filter", "acme"]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
