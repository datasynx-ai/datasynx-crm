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
import type { Journey } from "../../src/core/journey.js";

const JOURNEY: Journey = {
  id: "onboarding",
  name: "Onboarding",
  entryStepId: "welcome",
  steps: [
    { id: "welcome", type: "send", templateId: "welcome", next: "check_reply" },
    {
      id: "check_reply",
      type: "branch",
      condition: { field: "replied", equals: true },
      ifTrue: "thanks",
      ifFalse: "wait",
    },
    { id: "thanks", type: "send", templateId: "thanks", next: "done" },
    { id: "wait", type: "wait", waitDays: 3, next: "followup" },
    { id: "followup", type: "send", templateId: "followup", next: "done" },
    { id: "done", type: "exit" },
  ],
};

describe("journey engine (branching)", () => {
  it("advances send steps to next", async () => {
    const { advance } = await import("../../src/core/journey.js");
    const r = advance(JOURNEY, "welcome", {});
    expect(r.step.type).toBe("send");
    expect(r.nextStepId).toBe("check_reply");
  });

  it("branches true → ifTrue when condition matches", async () => {
    const { advance } = await import("../../src/core/journey.js");
    expect(advance(JOURNEY, "check_reply", { replied: true }).nextStepId).toBe("thanks");
  });

  it("branches false → ifFalse when condition does not match", async () => {
    const { advance } = await import("../../src/core/journey.js");
    expect(advance(JOURNEY, "check_reply", { replied: false }).nextStepId).toBe("wait");
  });

  it("exit has no next step", async () => {
    const { advance } = await import("../../src/core/journey.js");
    expect(advance(JOURNEY, "done", {}).nextStepId).toBeUndefined();
  });
});

describe("journey storage", () => {
  it("defines and loads journeys", async () => {
    const { defineJourney, loadJourneys } = await import("../../src/core/journey.js");
    defineJourney(DATA_DIR, JOURNEY);
    const all = loadJourneys(DATA_DIR);
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe("onboarding");
  });
});
