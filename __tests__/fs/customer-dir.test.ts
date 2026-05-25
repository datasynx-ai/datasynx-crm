import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import {
  getCustomerDir,
  ensureCustomerDir,
  readMainFacts,
  writeMainFacts,
  customerExists,
} from "../../src/fs/customer-dir.js";

const DATA_DIR = "/data";
const SLUG = "acme-corp";

beforeEach(() => {
  vol.reset();
});

describe("getCustomerDir", () => {
  it("returns correct path for a slug", () => {
    const dir = getCustomerDir(DATA_DIR, SLUG);
    expect(dir).toBe("/data/customers/acme-corp");
  });

  it("handles nested data dir paths", () => {
    const dir = getCustomerDir("/home/user/crm", "beta-gmbh");
    expect(dir).toBe("/home/user/crm/customers/beta-gmbh");
  });
});

describe("customerExists", () => {
  it("returns false when directory does not exist", () => {
    expect(customerExists(DATA_DIR, SLUG)).toBe(false);
  });

  it("returns true when customer directory exists", () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/main_facts.md`]: "---\nname: Acme\n---\n",
    });
    expect(customerExists(DATA_DIR, SLUG)).toBe(true);
  });
});

describe("ensureCustomerDir", () => {
  it("creates the customer directory", async () => {
    await ensureCustomerDir(DATA_DIR, SLUG);
    const stat = vol.statSync(`${DATA_DIR}/customers/${SLUG}`);
    expect(stat.isDirectory()).toBe(true);
  });

  it("creates attachments/ subdirectory", async () => {
    await ensureCustomerDir(DATA_DIR, SLUG);
    const stat = vol.statSync(`${DATA_DIR}/customers/${SLUG}/attachments`);
    expect(stat.isDirectory()).toBe(true);
  });

  it("creates transcripts/ subdirectory", async () => {
    await ensureCustomerDir(DATA_DIR, SLUG);
    const stat = vol.statSync(`${DATA_DIR}/customers/${SLUG}/transcripts`);
    expect(stat.isDirectory()).toBe(true);
  });

  it("is idempotent — calling twice does not throw", async () => {
    await ensureCustomerDir(DATA_DIR, SLUG);
    await expect(ensureCustomerDir(DATA_DIR, SLUG)).resolves.not.toThrow();
  });
});

describe("writeMainFacts / readMainFacts", () => {
  const facts = {
    name: "Acme Corp",
    domain: "acme.com",
    email: "max@acme.com",
    relationship_stage: "active" as const,
    tags: ["enterprise"],
    currency: "EUR",
    created: "2024-01-15",
    updated: "2024-06-01",
  };

  it("writes and reads back main_facts.md correctly", async () => {
    await ensureCustomerDir(DATA_DIR, SLUG);
    await writeMainFacts(DATA_DIR, SLUG, facts);
    const read = await readMainFacts(DATA_DIR, SLUG);
    expect(read.name).toBe("Acme Corp");
    expect(read.relationship_stage).toBe("active");
    expect(read.tags).toEqual(["enterprise"]);
    expect(read.created).toBe("2024-01-15");
    expect(read.updated).toBe("2024-06-01");
  });

  it("creates main_facts.md with YAML frontmatter", async () => {
    await ensureCustomerDir(DATA_DIR, SLUG);
    await writeMainFacts(DATA_DIR, SLUG, facts);
    const content = vol.readFileSync(
      `${DATA_DIR}/customers/${SLUG}/main_facts.md`,
      "utf-8"
    ) as string;
    expect(content).toContain("---");
    expect(content).toContain("name: Acme Corp");
  });

  it("throws when main_facts.md does not exist", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    await expect(readMainFacts(DATA_DIR, SLUG)).rejects.toThrow();
  });

  it("throws on invalid frontmatter schema", async () => {
    // Write a file with invalid data (missing required fields)
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/main_facts.md`]: "---\nsome_field: value\n---\n",
    });
    await expect(readMainFacts(DATA_DIR, SLUG)).rejects.toThrow();
  });

  it("writes optional fields when provided", async () => {
    await ensureCustomerDir(DATA_DIR, SLUG);
    await writeMainFacts(DATA_DIR, SLUG, { ...facts, phone: "+49 123 456789" });
    const read = await readMainFacts(DATA_DIR, SLUG);
    expect(read.phone).toBe("+49 123 456789");
  });
});
