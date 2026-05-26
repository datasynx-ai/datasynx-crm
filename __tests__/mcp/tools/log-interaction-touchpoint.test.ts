import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("../../../src/fs/interactions-writer.js", () => ({
  appendInteraction: vi.fn().mockResolvedValue(undefined),
  formatInteractionEntry: vi.fn().mockReturnValue("## 2026-05-26 · Call\n..."),
}));

import { handleLogInteraction } from "../../../src/mcp/tools/log-interaction.js";
import { appendInteraction } from "../../../src/fs/interactions-writer.js";

const mockAppend = vi.mocked(appendInteraction);

const DATA_DIR = "/data";
const SLUG = "acme-corp";
const CUSTOMER_DIR = `${DATA_DIR}/customers/${SLUG}`;
const MAIN_FACTS_PATH = `${CUSTOMER_DIR}/main_facts.md`;

const mainFactsWithFrontmatter = `---
company: Acme Corp
last_touchpoint: "2026-01-01"
---

## Quick Reference
Key details here.
`;

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  mockAppend.mockResolvedValue(undefined);
});

describe("log_interaction — last_touchpoint update", () => {
  it("updates last_touchpoint in main_facts.md after successful log", async () => {
    vol.fromJSON({ [MAIN_FACTS_PATH]: mainFactsWithFrontmatter });

    await handleLogInteraction(
      {
        slug: SLUG,
        type: "Call",
        summary: "Discussed renewal",
        with: "John Smith",
      },
      DATA_DIR
    );

    // Read the main_facts.md back and check the frontmatter
    const { fs } = vol;
    const written = fs.readFileSync(MAIN_FACTS_PATH, "utf-8") as string;
    const today = new Date().toISOString().split("T")[0];
    expect(written).toContain(`last_touchpoint: ${today}`);
  });

  it("does not throw if main_facts.md does not exist", async () => {
    // No main_facts.md file — should succeed without error
    vol.fromJSON({ [`${CUSTOMER_DIR}/`]: null });

    const result = await handleLogInteraction(
      {
        slug: SLUG,
        type: "Call",
        summary: "A call happened",
        with: "Jane",
      },
      DATA_DIR
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { success: boolean };
    expect(parsed.success).toBe(true);
  });

  it("still returns success when appendInteraction succeeds even if main_facts.md exists", async () => {
    vol.fromJSON({ [MAIN_FACTS_PATH]: mainFactsWithFrontmatter });

    const result = await handleLogInteraction(
      {
        slug: SLUG,
        type: "Meeting",
        summary: "Quarterly business review",
        with: "CEO",
      },
      DATA_DIR
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { success: boolean };
    expect(parsed.success).toBe(true);
  });

  it("preserves existing frontmatter fields when updating last_touchpoint", async () => {
    vol.fromJSON({ [MAIN_FACTS_PATH]: mainFactsWithFrontmatter });

    await handleLogInteraction(
      {
        slug: SLUG,
        type: "Email",
        summary: "Sent follow-up email",
        with: "contact@acme.com",
      },
      DATA_DIR
    );

    const { fs } = vol;
    const written = fs.readFileSync(MAIN_FACTS_PATH, "utf-8") as string;
    expect(written).toContain("company: Acme Corp");
  });
});
