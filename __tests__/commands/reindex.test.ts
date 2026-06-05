import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { reindexCustomerMock } = vi.hoisted(() => ({ reindexCustomerMock: vi.fn() }));
vi.mock("../../src/core/lancedb.js", () => ({ reindexCustomer: reindexCustomerMock }));

beforeEach(() => {
  vi.resetModules();
  reindexCustomerMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("dxcrm reindex", () => {
  it("reports the number of reindexed documents", async () => {
    reindexCustomerMock.mockResolvedValue(7);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { reindexCommand } = await import("../../src/commands/reindex.js");
    await reindexCommand.parseAsync(["node", "reindex", "acme-corp"]);
    expect(reindexCustomerMock).toHaveBeenCalledWith(expect.any(String), "acme-corp");
    expect(logSpy.mock.calls.flat().join("\n")).toMatch(/Reindexed 7 document/i);
  });

  it("warns when there is nothing to reindex", async () => {
    reindexCustomerMock.mockResolvedValue(0);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { reindexCommand } = await import("../../src/commands/reindex.js");
    await reindexCommand.parseAsync(["node", "reindex", "ghost"]);
    expect(logSpy.mock.calls.flat().join("\n")).toMatch(/Nothing reindexed/i);
  });
});
