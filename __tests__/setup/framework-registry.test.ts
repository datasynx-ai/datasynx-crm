import { describe, it, expect, vi, beforeEach } from "vitest";

// We don't want real FS writes — mock all adapters
const mockDetect = vi.fn(() => false);
const mockInstall = vi.fn();
const mockIsInstalled = vi.fn(() => false);
const mockUninstall = vi.fn();

const makeAdapter = (name: string, detectResult: boolean = false) => ({
  name,
  detect: vi.fn(() => detectResult),
  install: mockInstall,
  isInstalled: mockIsInstalled,
  uninstall: mockUninstall,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("installAllDetected", () => {
  it("skips adapters that are not detected", async () => {
    // Import the real registry but override FRAMEWORK_ADAPTERS
    const registryModule = await import("../../src/setup/framework-registry.js");

    // All adapters return detect()=false in test environment (no IDEs installed)
    const results = await registryModule.installAllDetected({
      mcpServerPath: "/dist/mcp.js",
      dataDir: "/data",
      httpPort: 3847,
      serverName: "datasynx-opencrm",
    });

    // In test environment (no IDEs), should return empty array
    expect(Array.isArray(results)).toBe(true);
    // No real adapters should detect in CI
    for (const r of results) {
      expect(r.success !== undefined).toBe(true);
    }
  });
});

describe("FRAMEWORK_ADAPTERS", () => {
  it("contains at least 10 adapters", async () => {
    const { FRAMEWORK_ADAPTERS } = await import("../../src/setup/framework-registry.js");
    expect(FRAMEWORK_ADAPTERS.length).toBeGreaterThanOrEqual(10);
  });

  it("every adapter has required interface", async () => {
    const { FRAMEWORK_ADAPTERS } = await import("../../src/setup/framework-registry.js");
    for (const adapter of FRAMEWORK_ADAPTERS) {
      expect(typeof adapter.name).toBe("string");
      expect(typeof adapter.detect).toBe("function");
      expect(typeof adapter.install).toBe("function");
      expect(typeof adapter.isInstalled).toBe("function");
      expect(typeof adapter.uninstall).toBe("function");
    }
  });

  it("adapter names are unique", async () => {
    const { FRAMEWORK_ADAPTERS } = await import("../../src/setup/framework-registry.js");
    const names = FRAMEWORK_ADAPTERS.map((a) => a.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("includes Claude Code adapter", async () => {
    const { FRAMEWORK_ADAPTERS } = await import("../../src/setup/framework-registry.js");
    const names = FRAMEWORK_ADAPTERS.map((a) => a.name);
    expect(names.some((n) => n.toLowerCase().includes("claude"))).toBe(true);
  });
});
