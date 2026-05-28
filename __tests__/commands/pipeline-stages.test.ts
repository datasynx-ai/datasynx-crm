import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/core/pipeline-stages.js", () => ({
  getPipelineStages: vi.fn().mockReturnValue([
    { id: "lead", label: "Lead", order: 1, probability: 10 },
    { id: "won", label: "Won", order: 5, isFinal: true, probability: 100 },
  ]),
  setPipelineStage: vi.fn(),
  deletePipelineStage: vi.fn(),
  resetToDefaults: vi.fn(),
}));

import {
  getPipelineStages,
  setPipelineStage,
  deletePipelineStage,
  resetToDefaults,
} from "../../src/core/pipeline-stages.js";

const mockGet = vi.mocked(getPipelineStages);
const mockSet = vi.mocked(setPipelineStage);
const mockDelete = vi.mocked(deletePipelineStage);
const mockReset = vi.mocked(resetToDefaults);

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockReturnValue([
    { id: "lead", label: "Lead", order: 1, probability: 10 },
    { id: "won", label: "Won", order: 5, isFinal: true, probability: 100 },
  ]);
});

describe("stagesCommand — Commander structure", () => {
  it("exports stagesCommand with name 'stages'", async () => {
    const { stagesCommand } = await import("../../src/commands/pipeline-stages.js");
    expect(stagesCommand.name()).toBe("stages");
  });

  it("has 'list' subcommand", async () => {
    const { stagesCommand } = await import("../../src/commands/pipeline-stages.js");
    const names = stagesCommand.commands.map((c) => c.name());
    expect(names).toContain("list");
  });

  it("has 'set' subcommand", async () => {
    const { stagesCommand } = await import("../../src/commands/pipeline-stages.js");
    const names = stagesCommand.commands.map((c) => c.name());
    expect(names).toContain("set");
  });

  it("has 'delete' subcommand", async () => {
    const { stagesCommand } = await import("../../src/commands/pipeline-stages.js");
    const names = stagesCommand.commands.map((c) => c.name());
    expect(names).toContain("delete");
  });

  it("has 'reset' subcommand", async () => {
    const { stagesCommand } = await import("../../src/commands/pipeline-stages.js");
    const names = stagesCommand.commands.map((c) => c.name());
    expect(names).toContain("reset");
  });
});

describe("stagesCommand list", () => {
  it("calls getPipelineStages and prints table", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { stagesCommand } = await import("../../src/commands/pipeline-stages.js");
    await stagesCommand.parseAsync(["node", "dxcrm", "list"]);
    expect(mockGet).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("lead");
    logSpy.mockRestore();
  });
});

describe("stagesCommand set", () => {
  it("calls setPipelineStage with id, label, order", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { stagesCommand } = await import("../../src/commands/pipeline-stages.js");
    await stagesCommand.parseAsync([
      "node", "dxcrm", "set", "demo", "Demo Booked", "--order", "3", "--probability", "40",
    ]);
    expect(mockSet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: "demo", label: "Demo Booked", order: 3, probability: 40 })
    );
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("demo");
    logSpy.mockRestore();
  });

  it("includes isFinal when --final flag is passed", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { stagesCommand } = await import("../../src/commands/pipeline-stages.js");
    await stagesCommand.parseAsync([
      "node", "dxcrm", "set", "closed-won", "Closed Won", "--order", "10", "--final",
    ]);
    expect(mockSet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ isFinal: true })
    );
    logSpy.mockRestore();
  });
});

describe("stagesCommand delete", () => {
  it("calls deletePipelineStage when stage exists", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { stagesCommand } = await import("../../src/commands/pipeline-stages.js");
    await stagesCommand.parseAsync(["node", "dxcrm", "delete", "lead"]);
    expect(mockDelete).toHaveBeenCalledWith(expect.any(String), "lead");
    logSpy.mockRestore();
  });

  it("exits with error when stage not found", async () => {
    mockGet.mockReturnValue([{ id: "won", label: "Won", order: 5, isFinal: true, probability: 100 }]);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { stagesCommand } = await import("../../src/commands/pipeline-stages.js");
    await expect(stagesCommand.parseAsync(["node", "dxcrm", "delete", "missing"])).rejects.toThrow("exit");
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe("stagesCommand reset", () => {
  it("calls resetToDefaults", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { stagesCommand } = await import("../../src/commands/pipeline-stages.js");
    await stagesCommand.parseAsync(["node", "dxcrm", "reset"]);
    expect(mockReset).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
