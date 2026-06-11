import { describe, it, expect } from "vitest";
import {
  findUnexpectedInstallScripts,
  ALLOWED_INSTALL_SCRIPTS,
} from "../../scripts/check-install-scripts.js";

/** Build a minimal npm lockfile (v3 `packages` shape) with install-script flags. */
function lockfile(pkgs: Array<{ path: string; version: string; hasInstallScript?: boolean }>): {
  packages: Record<string, { version: string; hasInstallScript?: boolean }>;
} {
  const packages: Record<string, { version: string; hasInstallScript?: boolean }> = {
    "": { version: "0.0.0" },
  };
  for (const { path, version, hasInstallScript } of pkgs)
    packages[path] = { version, hasInstallScript };
  return { packages };
}

describe("findUnexpectedInstallScripts", () => {
  it("does NOT flag an allowlisted install-script package", () => {
    const v = findUnexpectedInstallScripts(
      lockfile([{ path: "node_modules/sharp", version: "0.34.5", hasInstallScript: true }])
    );
    expect(v).toEqual([]);
  });

  it("flags an unknown install-script package", () => {
    const v = findUnexpectedInstallScripts(
      lockfile([{ path: "node_modules/evil-pkg", version: "1.0.0", hasInstallScript: true }])
    );
    expect(v.map((x) => x.name)).toEqual(["evil-pkg"]);
    expect(v[0]?.version).toBe("1.0.0");
  });

  it("ignores packages without an install script", () => {
    const v = findUnexpectedInstallScripts(
      lockfile([
        { path: "node_modules/read-excel-file", version: "9.2.0" },
        { path: "node_modules/some-unlisted-pkg", version: "2.0.0", hasInstallScript: false },
      ])
    );
    expect(v).toEqual([]);
  });

  it("detects an unknown install-script package nested under another node_modules", () => {
    const v = findUnexpectedInstallScripts(
      lockfile([
        {
          path: "node_modules/some-pkg/node_modules/sneaky-native",
          version: "0.1.0",
          hasInstallScript: true,
        },
      ])
    );
    expect(v[0]?.name).toBe("sneaky-native");
    expect(v[0]?.path).toContain("some-pkg");
  });

  it("allowlists the six known install-script packages with reasons", () => {
    for (const name of [
      "sharp",
      "onnxruntime-node",
      "protobufjs",
      "tesseract.js",
      "esbuild",
      "fsevents",
    ]) {
      expect(ALLOWED_INSTALL_SCRIPTS[name]).toBeTruthy();
    }
  });

  it("passes a clean lockfile with only allowlisted scripts", () => {
    const v = findUnexpectedInstallScripts(
      lockfile([
        { path: "node_modules/sharp", version: "0.34.5", hasInstallScript: true },
        { path: "node_modules/onnxruntime-node", version: "1.24.3", hasInstallScript: true },
        { path: "node_modules/tesseract.js", version: "7.0.0", hasInstallScript: true },
        { path: "node_modules/read-excel-file", version: "9.2.0" },
      ])
    );
    expect(v).toEqual([]);
  });
});
