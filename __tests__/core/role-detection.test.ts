import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import { detectStakeholderRoles } from "../../src/core/role-detection.js";

describe("detectStakeholderRoles (#41 A5)", () => {
  it("detects an economic buyer from CFO/budget signals (DE)", () => {
    const roles = detectStakeholderRoles("CFO Thomas Berger äußert Budget-Bedenken");
    expect(roles.map((r) => r.role)).toContain("economic_buyer");
  });

  it("detects an economic buyer from English signals", () => {
    expect(
      detectStakeholderRoles("She signs the contract and holds the budget").map((r) => r.role)
    ).toContain("economic_buyer");
  });

  it("detects a champion", () => {
    expect(
      detectStakeholderRoles("Maria is our champion and will push this internally").map(
        (r) => r.role
      )
    ).toContain("champion");
  });

  it("detects a blocker", () => {
    expect(
      detectStakeholderRoles("The new lead is a blocker — won't approve the spend").map(
        (r) => r.role
      )
    ).toContain("blocker");
  });

  it("returns nothing for neutral text and dedupes per role", () => {
    expect(detectStakeholderRoles("Had a nice chat about the weather")).toEqual([]);
    const roles = detectStakeholderRoles("CFO and budget owner — the CFO again");
    expect(roles.filter((r) => r.role === "economic_buyer")).toHaveLength(1);
  });
});

describe("role auto-attribution into the graph (#41 A5)", () => {
  beforeEach(() => {
    vol.reset();
    vol.mkdirSync("/data/customers/acme", { recursive: true });
  });

  it("logging an interaction tags the contact as economic_buyer", async () => {
    const { updateGraphFromInteraction } = await import("../../src/core/graph-extractor.js");
    const { readGraph, getStakeholders } = await import("../../src/core/graph.js");
    await updateGraphFromInteraction("/data", "acme", {
      withStr: "Thomas Berger <thomas@acme.com>",
      interactionDate: "2026-06-10",
      text: "Preisgespräch; CFO Thomas Berger äußert Budget-Bedenken",
    });
    const graph = readGraph("/data", "acme");
    const { economicBuyers } = getStakeholders(graph);
    expect(economicBuyers.some((n) => n.label.includes("Thomas Berger"))).toBe(true);
  });
});
