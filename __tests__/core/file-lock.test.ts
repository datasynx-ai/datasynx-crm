import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("withJsonFile", () => {
  it("creates file when it does not exist (null current)", async () => {
    vol.fromJSON({ "/data/.keep": "" });
    const { withJsonFile } = await import("../../src/core/file-lock.js");

    const result = await withJsonFile<{ count: number }>(
      "/data/state.json",
      (current) => ({ count: (current?.count ?? 0) + 1 })
    );

    expect(result.count).toBe(1);
    const raw = vol.readFileSync("/data/state.json", "utf-8") as string;
    expect(JSON.parse(raw)).toEqual({ count: 1 });
  });

  it("reads existing file and passes it to updater", async () => {
    vol.fromJSON({ "/data/state.json": JSON.stringify({ count: 5 }) });
    const { withJsonFile } = await import("../../src/core/file-lock.js");

    const result = await withJsonFile<{ count: number }>(
      "/data/state.json",
      (current) => ({ count: (current?.count ?? 0) + 1 })
    );

    expect(result.count).toBe(6);
  });

  it("returns null as current when file is missing", async () => {
    vol.fromJSON({});
    const { withJsonFile } = await import("../../src/core/file-lock.js");
    let receivedCurrent: unknown = "not-called";

    await withJsonFile<{ x: number }>("/data/missing.json", (current) => {
      receivedCurrent = current;
      return { x: 1 };
    });

    expect(receivedCurrent).toBeNull();
  });

  it("returns null as current when file contains invalid JSON", async () => {
    vol.fromJSON({ "/data/bad.json": "not-json{{{" });
    const { withJsonFile } = await import("../../src/core/file-lock.js");
    let receivedCurrent: unknown = "not-called";

    await withJsonFile<{ x: number }>("/data/bad.json", (current) => {
      receivedCurrent = current;
      return { x: 99 };
    });

    expect(receivedCurrent).toBeNull();
  });

  it("creates parent directories if they do not exist", async () => {
    vol.fromJSON({});
    const { withJsonFile } = await import("../../src/core/file-lock.js");

    await withJsonFile<{ v: number }>("/data/nested/deep/state.json", () => ({ v: 7 }));

    const raw = vol.readFileSync("/data/nested/deep/state.json", "utf-8") as string;
    expect(JSON.parse(raw)).toEqual({ v: 7 });
  });

  it("serializes concurrent calls — second write sees first write result", async () => {
    vol.fromJSON({ "/data/counter.json": JSON.stringify({ n: 0 }) });
    const { withJsonFile } = await import("../../src/core/file-lock.js");

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Fire both simultaneously — without locking, both would read n=0 and write n=1
    const [r1, r2] = await Promise.all([
      withJsonFile<{ n: number }>("/data/counter.json", async (c) => {
        await delay(10);
        return { n: (c?.n ?? 0) + 1 };
      }),
      withJsonFile<{ n: number }>("/data/counter.json", async (c) => {
        await delay(5);
        return { n: (c?.n ?? 0) + 1 };
      }),
    ]);

    // One should be 1, the other 2 — never both 1
    const values = [r1.n, r2.n].sort();
    expect(values).toEqual([1, 2]);

    const raw = vol.readFileSync("/data/counter.json", "utf-8") as string;
    expect(JSON.parse(raw).n).toBe(2);
  });

  it("does not corrupt file when updater throws", async () => {
    vol.fromJSON({ "/data/safe.json": JSON.stringify({ x: 42 }) });
    const { withJsonFile } = await import("../../src/core/file-lock.js");

    await expect(
      withJsonFile<{ x: number }>("/data/safe.json", () => {
        throw new Error("updater failure");
      })
    ).rejects.toThrow("updater failure");

    // File should remain unchanged
    const raw = vol.readFileSync("/data/safe.json", "utf-8") as string;
    expect(JSON.parse(raw)).toEqual({ x: 42 });
  });

  it("returns value returned by updater", async () => {
    vol.fromJSON({});
    const { withJsonFile } = await import("../../src/core/file-lock.js");

    const result = await withJsonFile<string[]>("/data/list.json", () => ["a", "b", "c"]);
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("two different files do not block each other", async () => {
    vol.fromJSON({
      "/data/a.json": JSON.stringify({ n: 0 }),
      "/data/b.json": JSON.stringify({ n: 0 }),
    });
    const { withJsonFile } = await import("../../src/core/file-lock.js");

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const t0 = Date.now();

    await Promise.all([
      withJsonFile<{ n: number }>("/data/a.json", async (c) => { await delay(20); return { n: (c?.n ?? 0) + 1 }; }),
      withJsonFile<{ n: number }>("/data/b.json", async (c) => { await delay(20); return { n: (c?.n ?? 0) + 1 }; }),
    ]);

    // Should complete in ~20ms (parallel), not ~40ms (sequential)
    expect(Date.now() - t0).toBeLessThan(60);
  });

  it("handles async updater", async () => {
    vol.fromJSON({ "/data/async.json": JSON.stringify({ items: [] }) });
    const { withJsonFile } = await import("../../src/core/file-lock.js");

    const result = await withJsonFile<{ items: number[] }>("/data/async.json", async (c) => {
      await new Promise((r) => setTimeout(r, 1));
      return { items: [...(c?.items ?? []), 99] };
    });

    expect(result.items).toEqual([99]);
  });
});
