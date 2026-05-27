import { describe, it, expect, beforeEach } from "vitest";
import {
  registerPlugin,
  getPlugin,
  listPlugins,
  unregisterPlugin,
} from "../../src/core/plugin-registry.js";
import type { DxcrmPlugin } from "../../src/core/plugin-registry.js";

// Since the registry is module-level state, we need to clean up between tests.
// Use unregisterPlugin to clean up.
beforeEach(() => {
  // Clean up any plugins registered during tests
  const registered = listPlugins();
  for (const p of registered) {
    unregisterPlugin(p.name);
  }
});

const makePlugin = (name: string, version = "1.0.0"): DxcrmPlugin => ({
  name,
  version,
  description: `Test plugin ${name}`,
});

describe("registerPlugin", () => {
  it("stores a plugin", () => {
    registerPlugin(makePlugin("test-plugin"));
    expect(getPlugin("test-plugin")).toBeDefined();
    expect(getPlugin("test-plugin")!.name).toBe("test-plugin");
  });

  it("throws on duplicate name", () => {
    registerPlugin(makePlugin("duplicate"));
    expect(() => registerPlugin(makePlugin("duplicate"))).toThrow(/already registered/);
  });

  it("stores all plugin fields", () => {
    const plugin: DxcrmPlugin = {
      name: "full-plugin",
      version: "2.1.0",
      description: "A full plugin",
      mcpTools: ["my_tool", "other_tool"],
    };
    registerPlugin(plugin);
    const stored = getPlugin("full-plugin");
    expect(stored?.version).toBe("2.1.0");
    expect(stored?.description).toBe("A full plugin");
    expect(stored?.mcpTools).toEqual(["my_tool", "other_tool"]);
  });
});

describe("getPlugin", () => {
  it("returns undefined for unknown name", () => {
    expect(getPlugin("nonexistent")).toBeUndefined();
  });

  it("returns the plugin for a known name", () => {
    registerPlugin(makePlugin("known-plugin"));
    const p = getPlugin("known-plugin");
    expect(p).toBeDefined();
    expect(p!.name).toBe("known-plugin");
  });
});

describe("listPlugins", () => {
  it("returns empty array when no plugins registered", () => {
    expect(listPlugins()).toEqual([]);
  });

  it("returns all registered plugins", () => {
    registerPlugin(makePlugin("plugin-a"));
    registerPlugin(makePlugin("plugin-b"));
    registerPlugin(makePlugin("plugin-c"));
    const plugins = listPlugins();
    expect(plugins).toHaveLength(3);
    const names = plugins.map((p) => p.name);
    expect(names).toContain("plugin-a");
    expect(names).toContain("plugin-b");
    expect(names).toContain("plugin-c");
  });
});

describe("unregisterPlugin", () => {
  it("removes the plugin", () => {
    registerPlugin(makePlugin("removable"));
    expect(getPlugin("removable")).toBeDefined();
    const removed = unregisterPlugin("removable");
    expect(removed).toBe(true);
    expect(getPlugin("removable")).toBeUndefined();
  });

  it("returns false for nonexistent plugin", () => {
    expect(unregisterPlugin("nonexistent")).toBe(false);
  });

  it("removed plugin is not in listPlugins", () => {
    registerPlugin(makePlugin("to-remove"));
    registerPlugin(makePlugin("to-keep"));
    unregisterPlugin("to-remove");
    const plugins = listPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0]!.name).toBe("to-keep");
  });
});
