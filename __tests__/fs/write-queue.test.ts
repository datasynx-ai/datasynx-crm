import { describe, it, expect, beforeEach } from "vitest";

// write-queue.ts has no fs dependency, no need to reset vol
// But we reset modules to get a fresh queues Map each test
import { vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("withFileQueue — serialization", () => {
  it("executes concurrent calls to the same key in order", async () => {
    const { withFileQueue } = await import("../../src/fs/write-queue.js");

    const order: number[] = [];

    // Create three tasks that each "take time" — resolve after a tick
    const task1 = withFileQueue("/file/a", async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      order.push(1);
    });
    const task2 = withFileQueue("/file/a", async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      order.push(2);
    });
    const task3 = withFileQueue("/file/a", async () => {
      order.push(3);
    });

    await Promise.all([task1, task2, task3]);

    // Despite different resolve times, order must be 1, 2, 3 (queue order)
    expect(order).toEqual([1, 2, 3]);
  });

  it("calls for different keys do not block each other", async () => {
    const { withFileQueue } = await import("../../src/fs/write-queue.js");

    const started: string[] = [];

    const taskA = withFileQueue("/file/a", async () => {
      started.push("a-start");
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
      started.push("a-end");
    });

    const taskB = withFileQueue("/file/b", async () => {
      started.push("b-start");
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      started.push("b-end");
    });

    await Promise.all([taskA, taskB]);

    // b should start before a ends (parallel execution for different keys)
    const aStart = started.indexOf("a-start");
    const bStart = started.indexOf("b-start");
    const aEnd = started.indexOf("a-end");
    const bEnd = started.indexOf("b-end");

    // Both should start before either ends (parallel)
    expect(aStart).toBeLessThan(aEnd);
    expect(bStart).toBeLessThan(bEnd);
    // b finishes before a (since b is shorter) — confirms no blocking
    expect(bEnd).toBeLessThan(aEnd);
  });

  it("returns the value produced by fn", async () => {
    const { withFileQueue } = await import("../../src/fs/write-queue.js");

    const result = await withFileQueue("/file/a", async () => {
      return 42;
    });

    expect(result).toBe(42);
  });

  it("an error in one call does not block subsequent calls for the same key", async () => {
    const { withFileQueue } = await import("../../src/fs/write-queue.js");

    const results: string[] = [];

    // First call throws
    const failing = withFileQueue("/file/a", async () => {
      throw new Error("disk full");
    });

    // Second call should still run
    const succeeding = withFileQueue("/file/a", async () => {
      results.push("ran");
    });

    await expect(failing).rejects.toThrow("disk full");
    await succeeding;

    expect(results).toContain("ran");
  });

  it("runs multiple sequential calls one after another", async () => {
    const { withFileQueue } = await import("../../src/fs/write-queue.js");

    const log: number[] = [];

    for (let i = 0; i < 5; i++) {
      const n = i;
      void withFileQueue("/file/seq", async () => {
        log.push(n);
      });
    }

    // Wait for the queue to drain by waiting a tick
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(log).toEqual([0, 1, 2, 3, 4]);
  });
});
