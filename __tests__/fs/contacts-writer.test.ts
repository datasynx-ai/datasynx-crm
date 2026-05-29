import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const DATA_DIR = "/data";
const SLUG = "acme-corp";

beforeEach(() => { vol.reset(); vi.resetModules(); });

describe("upsertContact / listContacts", () => {
  it("writes first contact and reads it back", async () => {
    vol.fromJSON({});
    const { upsertContact, listContacts } = await import("../../src/fs/contacts-writer.js");
    upsertContact(DATA_DIR, SLUG, { email: "alice@acme.com", name: "Alice Smith", isPrimary: true });
    const contacts = listContacts(DATA_DIR, SLUG);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.email).toBe("alice@acme.com");
    expect(contacts[0]?.name).toBe("Alice Smith");
    expect(contacts[0]?.isPrimary).toBe(true);
  });

  it("stores optional fields", async () => {
    vol.fromJSON({});
    const { upsertContact, listContacts } = await import("../../src/fs/contacts-writer.js");
    upsertContact(DATA_DIR, SLUG, {
      email: "alice@acme.com",
      name: "Alice",
      isPrimary: false,
      title: "CTO",
      phone: "+49 111 222 333",
      department: "Engineering",
    });
    const contacts = listContacts(DATA_DIR, SLUG);
    expect(contacts[0]?.title).toBe("CTO");
    expect(contacts[0]?.phone).toBe("+49 111 222 333");
    expect(contacts[0]?.department).toBe("Engineering");
  });

  it("adds second contact without removing first", async () => {
    vol.fromJSON({});
    const { upsertContact, listContacts } = await import("../../src/fs/contacts-writer.js");
    upsertContact(DATA_DIR, SLUG, { email: "alice@acme.com", name: "Alice", isPrimary: true });
    upsertContact(DATA_DIR, SLUG, { email: "bob@acme.com", name: "Bob", isPrimary: false });
    expect(listContacts(DATA_DIR, SLUG)).toHaveLength(2);
  });

  it("deduplicates by email (case-insensitive) and merges fields", async () => {
    vol.fromJSON({});
    const { upsertContact, listContacts } = await import("../../src/fs/contacts-writer.js");
    upsertContact(DATA_DIR, SLUG, { email: "alice@acme.com", name: "Alice", isPrimary: false });
    upsertContact(DATA_DIR, SLUG, { email: "ALICE@ACME.COM", name: "Alice Updated", isPrimary: false });
    const contacts = listContacts(DATA_DIR, SLUG);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.name).toBe("Alice Updated");
  });

  it("demotes other contacts when a new primary is set", async () => {
    vol.fromJSON({});
    const { upsertContact, listContacts } = await import("../../src/fs/contacts-writer.js");
    upsertContact(DATA_DIR, SLUG, { email: "alice@acme.com", name: "Alice", isPrimary: true });
    upsertContact(DATA_DIR, SLUG, { email: "bob@acme.com", name: "Bob", isPrimary: true });
    const contacts = listContacts(DATA_DIR, SLUG);
    const primaries = contacts.filter((c) => c.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]?.email).toBe("bob@acme.com");
  });

  it("returns empty array when contacts.json does not exist", async () => {
    vol.fromJSON({});
    const { listContacts } = await import("../../src/fs/contacts-writer.js");
    expect(listContacts(DATA_DIR, SLUG)).toEqual([]);
  });

  it("returns empty array on corrupted contacts.json", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/contacts.json`]: "not json" });
    const { listContacts } = await import("../../src/fs/contacts-writer.js");
    expect(listContacts(DATA_DIR, SLUG)).toEqual([]);
  });
});

describe("getPrimaryContact", () => {
  it("returns the contact marked isPrimary", async () => {
    vol.fromJSON({});
    const { upsertContact, getPrimaryContact } = await import("../../src/fs/contacts-writer.js");
    upsertContact(DATA_DIR, SLUG, { email: "alice@acme.com", name: "Alice", isPrimary: false });
    upsertContact(DATA_DIR, SLUG, { email: "bob@acme.com", name: "Bob", isPrimary: true });
    expect(getPrimaryContact(DATA_DIR, SLUG)?.email).toBe("bob@acme.com");
  });

  it("falls back to first contact if none marked primary", async () => {
    vol.fromJSON({});
    const { upsertContact, getPrimaryContact } = await import("../../src/fs/contacts-writer.js");
    upsertContact(DATA_DIR, SLUG, { email: "alice@acme.com", name: "Alice", isPrimary: false });
    upsertContact(DATA_DIR, SLUG, { email: "bob@acme.com", name: "Bob", isPrimary: false });
    expect(getPrimaryContact(DATA_DIR, SLUG)?.email).toBe("alice@acme.com");
  });

  it("returns null when no contacts exist", async () => {
    vol.fromJSON({});
    const { getPrimaryContact } = await import("../../src/fs/contacts-writer.js");
    expect(getPrimaryContact(DATA_DIR, SLUG)).toBeNull();
  });
});
