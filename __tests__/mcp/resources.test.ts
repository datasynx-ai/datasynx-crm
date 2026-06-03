import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
});

interface CapturedResource {
  name: string;
  uriOrTemplate: unknown;
  cb: (uri: URL, vars?: Record<string, string>) => Promise<{ contents: Array<{ text: string }> }>;
}

function fakeServer(captured: CapturedResource[]) {
  return {
    registerResource: (
      name: string,
      uriOrTemplate: unknown,
      _config: unknown,
      cb: CapturedResource["cb"]
    ) => {
      captured.push({ name, uriOrTemplate, cb });
    },
  } as never;
}

describe("registerResources", () => {
  it("registers the core CRM resources", async () => {
    const { registerResources } = await import("../../src/mcp/resources.js");
    const captured: CapturedResource[] = [];
    registerResources(fakeServer(captured), "/crm");
    const names = captured.map((c) => c.name);
    expect(names).toContain("customers");
    expect(names).toContain("customer");
    expect(names).toContain("pipeline");
    expect(names).toContain("timeline");
  });

  it("customers resource lists customer slugs as JSON", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/main_facts.md": "---\nname: Acme\n---\n",
      "/crm/customers/beta-inc/main_facts.md": "---\nname: Beta\n---\n",
    });
    const { registerResources } = await import("../../src/mcp/resources.js");
    const captured: CapturedResource[] = [];
    registerResources(fakeServer(captured), "/crm");
    const customers = captured.find((c) => c.name === "customers")!;
    const res = await customers.cb(new URL("crm://customers"));
    const slugs = JSON.parse(res.contents[0]!.text) as string[];
    expect(slugs).toContain("acme-corp");
    expect(slugs).toContain("beta-inc");
  });

  it("pipeline resource returns deals for a slug", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/pipeline.md":
        "# Pipeline\n\n| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n|---|---|---|---|---|---|---|---|\n| Big Deal | won | 1000 | EUR | 100 | | | 2026-01-01 |\n",
    });
    const { registerResources } = await import("../../src/mcp/resources.js");
    const captured: CapturedResource[] = [];
    registerResources(fakeServer(captured), "/crm");
    const pipeline = captured.find((c) => c.name === "pipeline")!;
    const res = await pipeline.cb(new URL("crm://pipeline/acme-corp"), { slug: "acme-corp" });
    expect(res.contents[0]!.text).toContain("Big Deal");
  });
});
