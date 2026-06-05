import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
  vi.resetModules();
});
afterEach(() => vi.restoreAllMocks());

describe("dxcrm eval-embeddings", () => {
  it("prints recall@k and MRR for a fixtures file", async () => {
    vol.fromJSON({
      "/fixtures.json": JSON.stringify({
        documents: [
          { id: "d1", text: "pricing discussion" },
          { id: "d2", text: "weather chat" },
        ],
        queries: [{ query: "pricing", relevantIds: ["d1"] }],
      }),
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { evalEmbeddingsCommand } = await import("../../src/commands/eval-embeddings.js");
    await evalEmbeddingsCommand.parseAsync([
      "node",
      "eval-embeddings",
      "/fixtures.json",
      "--k",
      "2",
    ]);
    const out = logSpy.mock.calls.flat().join("\n");
    expect(out).toMatch(/recall@2/i);
    expect(out).toMatch(/MRR/i);
  });

  it("errors out when the fixtures file is missing", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { evalEmbeddingsCommand } = await import("../../src/commands/eval-embeddings.js");
    await evalEmbeddingsCommand.parseAsync(["node", "eval-embeddings", "/nope.json"]);
    expect(errSpy.mock.calls.flat().join("\n")).toMatch(/not found/i);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
