import { describe, it, expect } from "vitest";
import serverJson from "../server.json";
import pkg from "../package.json";

describe("server.json (MCP registry manifest)", () => {
  it("uses a reverse-DNS server name", () => {
    expect(serverJson.name).toMatch(/^io\.github\.[\w-]+\/[\w-]+$/);
  });

  it("publishes the npm package matching package.json name", () => {
    const npmPkg = serverJson.packages.find((p) => p.registryType === "npm");
    expect(npmPkg).toBeDefined();
    expect(npmPkg!.identifier).toBe(pkg.name);
    expect(npmPkg!.transport.type).toBe("stdio");
  });

  it("manifest version is semver-shaped (sync to package.json handled at release)", () => {
    expect(serverJson.version).toMatch(/^\d+\.\d+\.\d+/);
    const npmPkg = serverJson.packages.find((p) => p.registryType === "npm");
    expect(npmPkg!.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
