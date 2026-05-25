import { vi } from "vitest";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});
vi.mock("fs/promises", async () => {
  const { fs } = await import("memfs");
  return { default: fs.promises, ...fs.promises };
});

vi.mock("@lancedb/lancedb", () => ({
  default: {
    connect: vi.fn().mockResolvedValue({
      openTable: vi.fn(),
      createEmptyTable: vi.fn(),
      tableNames: vi.fn().mockResolvedValue([]),
    }),
  },
  connect: vi.fn().mockResolvedValue({
    openTable: vi.fn(),
    createEmptyTable: vi.fn(),
    tableNames: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn().mockResolvedValue(
    vi.fn().mockResolvedValue([{ data: new Float32Array(384).fill(0.1) }])
  ),
  env: { cacheDir: "" },
}));

vi.mock("googleapis");
