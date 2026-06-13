import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import {
  readAgenticConfig,
  writeAgenticConfig,
  getConfigPath,
} from "../../src/fs/agentic-config.js";

const DATA_DIR = "/data";

beforeEach(() => {
  vol.reset();
});

describe("agentic-config", () => {
  it("returns {} for a missing config file", () => {
    expect(readAgenticConfig(DATA_DIR)).toEqual({});
  });

  it("returns {} for an invalid (unparseable) config file", () => {
    vol.fromJSON({ [getConfigPath(DATA_DIR)]: "{ not json" });
    expect(readAgenticConfig(DATA_DIR)).toEqual({});
  });

  it("round-trips a config", () => {
    writeAgenticConfig(DATA_DIR, {
      starterSeed: { version: 1, seededAt: "t", templateIds: ["a"], sequenceIds: [] },
    });
    const read = readAgenticConfig(DATA_DIR);
    expect(read.starterSeed?.templateIds).toEqual(["a"]);
  });

  it("preserves unknown base keys (version/dataDir/created) when mutating one field", () => {
    vol.fromJSON({
      [getConfigPath(DATA_DIR)]: JSON.stringify({
        version: 1,
        dataDir: "/data",
        created: "2026-01-01",
      }),
    });
    const config = readAgenticConfig(DATA_DIR);
    config.starterSeed = { version: 1, seededAt: "t", templateIds: [], sequenceIds: [] };
    writeAgenticConfig(DATA_DIR, config);

    const read = readAgenticConfig(DATA_DIR);
    expect(read["version"]).toBe(1);
    expect(read["dataDir"]).toBe("/data");
    expect(read["created"]).toBe("2026-01-01");
    expect(read.starterSeed).toBeDefined();
  });
});
