import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
});

const DATA_DIR = "/crm";
async function mod() {
  return import("../../src/core/sop.js");
}

describe("SOP store + search", () => {
  it("adds global + customer SOPs and loads both for a customer", async () => {
    const { addSop, loadSops } = await mod();
    addSop(DATA_DIR, {
      scope: "global",
      title: "Create a quote",
      triggers: ["quote", "pricing"],
      body: "...",
    });
    addSop(DATA_DIR, {
      scope: "customer",
      slug: "acme",
      title: "Acme quote process",
      triggers: ["quote"],
      body: "...",
    });

    const sops = loadSops(DATA_DIR, "acme");
    expect(sops).toHaveLength(2);
    const global = loadSops(DATA_DIR);
    expect(global).toHaveLength(1);
  });

  it("findSops returns customer-specific SOP before the global one", async () => {
    const { addSop, findSops } = await mod();
    addSop(DATA_DIR, {
      scope: "global",
      title: "Create a quote",
      triggers: ["quote", "pricing"],
      body: "global steps",
    });
    addSop(DATA_DIR, {
      scope: "customer",
      slug: "acme",
      title: "Acme quote process",
      triggers: ["quote"],
      body: "acme steps",
    });

    const hits = await findSops(DATA_DIR, "create a quote", "acme");
    expect(hits[0]!.scope).toBe("customer");
    expect(hits[0]!.slug).toBe("acme");
  });

  it("drops non-matching SOPs", async () => {
    const { addSop, findSops } = await mod();
    addSop(DATA_DIR, {
      scope: "global",
      title: "Refund handling",
      triggers: ["refund"],
      body: "...",
    });
    expect(await findSops(DATA_DIR, "completely unrelated topic")).toHaveLength(0);
  });
});
