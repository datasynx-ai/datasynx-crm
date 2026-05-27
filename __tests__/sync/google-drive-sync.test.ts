import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/core/lancedb.js", () => ({
  indexInLanceDB: vi.fn().mockResolvedValue(undefined),
  searchKnowledge: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../src/fs/interactions-writer.js", () => ({
  appendInteraction: vi.fn().mockResolvedValue(undefined),
  readInteractions: vi.fn().mockResolvedValue(""),
}));

const BASE_OPTS = {
  slug: "acme-corp",
  dataDir: "/data",
  accessToken: "test-token",
  customerName: "Acme Corp",
};

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();

  // Re-set mock implementations after resetModules
  vi.mock("../../src/core/lancedb.js", () => ({
    indexInLanceDB: vi.fn().mockResolvedValue(undefined),
    searchKnowledge: vi.fn().mockResolvedValue([]),
  }));

  vi.mock("../../src/fs/interactions-writer.js", () => ({
    appendInteraction: vi.fn().mockResolvedValue(undefined),
    readInteractions: vi.fn().mockResolvedValue(""),
  }));
});

describe("syncGoogleDriveFiles", () => {
  it("returns { synced:0, skipped:0, errors:[] } on empty file list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ files: [] }),
        text: async () => "",
      })
    );

    const { syncGoogleDriveFiles } = await import(
      "../../src/sync/google-drive-sync.js"
    );
    const result = await syncGoogleDriveFiles(BASE_OPTS);

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("syncs one Google Doc (exports as plain text, calls appendInteraction)", async () => {
    const docFile = {
      id: "doc123",
      name: "Proposal Q1",
      mimeType: "application/vnd.google-apps.document",
      modifiedTime: "2026-05-01T10:00:00Z",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [docFile] }),
          text: async () => "",
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => "This is the proposal text content.",
          json: async () => ({}),
        })
    );

    vol.fromJSON({ "/data/customers/acme-corp/interactions.md": "" });

    const { syncGoogleDriveFiles } = await import(
      "../../src/sync/google-drive-sync.js"
    );
    const { appendInteraction } = await import(
      "../../src/fs/interactions-writer.js"
    );

    const result = await syncGoogleDriveFiles(BASE_OPTS);

    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
    expect(appendInteraction).toHaveBeenCalledOnce();

    const callArgs = vi.mocked(appendInteraction).mock.calls[0]!;
    expect(callArgs[2].sourceRef).toBe("google://drive/doc123");
    expect(callArgs[2].summary).toContain("Proposal Q1");
  });

  it("skips non-Doc files but records them via appendInteraction", async () => {
    const pdfFile = {
      id: "pdf456",
      name: "Contract.pdf",
      mimeType: "application/pdf",
      modifiedTime: "2026-05-02T10:00:00Z",
      webViewLink: "https://drive.google.com/file/d/pdf456/view",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [pdfFile] }),
        text: async () => "",
      })
    );

    const { syncGoogleDriveFiles } = await import(
      "../../src/sync/google-drive-sync.js"
    );
    const { appendInteraction } = await import(
      "../../src/fs/interactions-writer.js"
    );

    const result = await syncGoogleDriveFiles(BASE_OPTS);

    expect(result.synced).toBe(1);
    expect(result.errors).toEqual([]);
    // appendInteraction called for non-Doc files too
    expect(appendInteraction).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(appendInteraction).mock.calls[0]!;
    expect(callArgs[2].sourceRef).toBe("google://drive/pdf456");
    expect(callArgs[2].summary).toContain("Contract.pdf");
  });

  it("skips already-synced files (sourceRef in existing interactions)", async () => {
    const existingRef = "google://drive/alreadysynced";
    const file = {
      id: "alreadysynced",
      name: "Old File",
      mimeType: "application/pdf",
    };

    // readInteractions returns content with existing sourceRef
    const { readInteractions } = await import(
      "../../src/fs/interactions-writer.js"
    );
    vi.mocked(readInteractions).mockResolvedValue(
      `**Source:** ${existingRef}\n`
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [file] }),
        text: async () => "",
      })
    );

    const { syncGoogleDriveFiles } = await import(
      "../../src/sync/google-drive-sync.js"
    );
    const { appendInteraction } = await import(
      "../../src/fs/interactions-writer.js"
    );

    const result = await syncGoogleDriveFiles(BASE_OPTS);

    expect(result.skipped).toBe(1);
    expect(result.synced).toBe(0);
    expect(appendInteraction).not.toHaveBeenCalled();
  });

  it("follows nextPageToken pagination", async () => {
    const file1 = {
      id: "file1",
      name: "Doc 1",
      mimeType: "application/pdf",
    };
    const file2 = {
      id: "file2",
      name: "Doc 2",
      mimeType: "application/pdf",
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [file1], nextPageToken: "tok_page2" }),
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [file2] }),
        text: async () => "",
      });

    vi.stubGlobal("fetch", fetchMock);

    const { syncGoogleDriveFiles } = await import(
      "../../src/sync/google-drive-sync.js"
    );
    const result = await syncGoogleDriveFiles(BASE_OPTS);

    expect(result.synced).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondCallUrl = String(fetchMock.mock.calls[1]![0]);
    expect(secondCallUrl).toContain("pageToken=tok_page2");
  });

  it("handles API error gracefully (returns error in errors array)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      })
    );

    const { syncGoogleDriveFiles } = await import(
      "../../src/sync/google-drive-sync.js"
    );
    const result = await syncGoogleDriveFiles(BASE_OPTS);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/403/);
    expect(result.synced).toBe(0);
  });

  it('uses "google://drive/{id}" as sourceRef', async () => {
    const file = {
      id: "myFileId",
      name: "Test.pdf",
      mimeType: "application/pdf",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [file] }),
        text: async () => "",
      })
    );

    const { syncGoogleDriveFiles } = await import(
      "../../src/sync/google-drive-sync.js"
    );
    const { appendInteraction } = await import(
      "../../src/fs/interactions-writer.js"
    );

    await syncGoogleDriveFiles(BASE_OPTS);

    expect(appendInteraction).toHaveBeenCalledOnce();
    expect(vi.mocked(appendInteraction).mock.calls[0]![2].sourceRef).toBe(
      "google://drive/myFileId"
    );
  });
});
