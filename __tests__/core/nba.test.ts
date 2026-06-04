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

function pipeline(stage: string): string {
  return (
    "# Pipeline\n\n| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n" +
    "|---|---|---|---|---|---|---|---|\n" +
    `| Big Deal | ${stage} | 50000 | EUR | 80 | | | 2026-06-01 |\n`
  );
}

describe("nextBestAction", () => {
  it("recommends closing actions for a negotiation deal (high priority)", async () => {
    vol.fromJSON({
      "/crm/customers/acme/pipeline.md": pipeline("negotiation"),
      "/crm/customers/acme/interactions.md":
        "# Interactions\n\n## 2026-06-01 · Call\n**Summary:** x\n---\n",
    });
    const { nextBestAction } = await import("../../src/core/nba.js");
    const actions = await nextBestAction(DATA_DIR, "acme");
    expect(actions[0]!.priority).toBe("high");
    expect(actions[0]!.action.toLowerCase()).toMatch(/objection|close/);
  });

  it("recommends re-engagement when there is no interaction history", async () => {
    vol.fromJSON({ "/crm/customers/acme/pipeline.md": pipeline("lead") });
    const { nextBestAction } = await import("../../src/core/nba.js");
    const actions = await nextBestAction(DATA_DIR, "acme");
    expect(actions.some((a) => /re-engage|no .*interaction/i.test(a.action))).toBe(true);
  });
});
