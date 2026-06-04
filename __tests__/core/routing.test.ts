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
import type { RoutingAgent } from "../../src/core/routing.js";

const AGENTS: RoutingAgent[] = [
  { name: "alice", skills: ["billing"], available: true, load: 2 },
  { name: "bob", skills: ["billing", "technical"], available: true, load: 0 },
  { name: "carol", skills: ["technical"], available: false, load: 0 },
];

describe("routeTicket", () => {
  it("routes to the least-loaded available agent with the required skill", async () => {
    const { routeTicket } = await import("../../src/core/routing.js");
    expect(routeTicket(AGENTS, { skill: "billing" })).toBe("bob");
  });

  it("skips unavailable agents even if skilled", async () => {
    const { routeTicket } = await import("../../src/core/routing.js");
    // only carol has 'technical' but is unavailable; bob also has technical and is available
    expect(routeTicket(AGENTS, { skill: "technical" })).toBe("bob");
  });

  it("returns null when no agent can take it", async () => {
    const { routeTicket } = await import("../../src/core/routing.js");
    expect(routeTicket(AGENTS, { skill: "legal" })).toBeNull();
  });

  it("ignores skill filter when none requested (least-loaded available)", async () => {
    const { routeTicket } = await import("../../src/core/routing.js");
    expect(routeTicket(AGENTS, {})).toBe("bob");
  });
});

describe("routing agent store", () => {
  it("saves and loads routing agents", async () => {
    const { saveRoutingAgents, loadRoutingAgents } = await import("../../src/core/routing.js");
    saveRoutingAgents(DATA_DIR, AGENTS);
    expect(loadRoutingAgents(DATA_DIR)).toHaveLength(3);
  });
});
