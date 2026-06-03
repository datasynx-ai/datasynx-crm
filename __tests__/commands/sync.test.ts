import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

// Mock dynamic imports used inside syncCommand action
vi.mock("../../src/sync/gmail-auth.js", () => ({
  getGmailAuth: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../src/sync/gmail-sync.js", () => ({
  syncGmail: vi.fn().mockResolvedValue({ synced: 2, skipped: 0 }),
}));
vi.mock("../../src/sync/microsoft-auth.js", () => ({
  getMicrosoftToken: vi.fn().mockResolvedValue("tok"),
}));
vi.mock("../../src/sync/microsoft-sync.js", () => ({
  syncMicrosoft: vi.fn().mockResolvedValue({ synced: 0, skipped: 0 }),
}));
vi.mock("../../src/sync/microsoft-calendar.js", () => ({
  syncMicrosoftCalendar: vi.fn().mockResolvedValue({ synced: 0, skipped: 0 }),
}));
vi.mock("../../src/sync/transcript-watcher.js", () => ({
  processTranscriptFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/sync/google-drive-sync.js", () => ({
  syncGoogleDriveFiles: vi.fn().mockResolvedValue({ synced: 0, skipped: 0, errors: [] }),
}));

const DATA_DIR = "/data";

describe("syncCommand — missing customer", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("exits when customer directory does not exist", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.keep`]: "" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as () => never);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await expect(syncCommand.parseAsync(["node", "sync", "unknown-slug"])).rejects.toThrow(
      "process.exit"
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
    expect(exitSpy).toHaveBeenCalledWith(1);
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("exits when sources.json does not exist", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as () => never);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await expect(syncCommand.parseAsync(["node", "sync", "acme"])).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("sources.json"));
    expect(exitSpy).toHaveBeenCalledWith(1);
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe("syncCommand — gmail not configured", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("logs info when gmail not enabled in sources.json", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({ gmail: { enabled: false } }),
    });
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--gmail"]);

    const output = infoSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Sync complete");
    infoSpy.mockRestore();
  });
});

describe("syncCommand — gmail configured", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("runs gmail sync when credentials exist", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({
        gmail: { enabled: true, query: "from:acme.com" },
      }),
      [`${DATA_DIR}/.agentic/gmail-token.json`]: "{}",
      [`${DATA_DIR}/.agentic/gmail-credentials.json`]: "{}",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--gmail"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Sync complete");
    consoleSpy.mockRestore();
  });

  it("logs info when gmail credentials not configured", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({
        gmail: { enabled: true, query: "from:acme.com" },
      }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--gmail"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("credentials not configured");
    consoleSpy.mockRestore();
  });
});

describe("syncCommand — since option", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("uses --since date when provided with gmail", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({
        gmail: { enabled: true, query: "from:acme.com" },
      }),
      [`${DATA_DIR}/.agentic/gmail-token.json`]: "{}",
      [`${DATA_DIR}/.agentic/gmail-credentials.json`]: "{}",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--gmail", "--since", "2026-01-01"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Sync complete");
    consoleSpy.mockRestore();
  });
});

describe("syncCommand — microsoft no token", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("shows 'no token found' when getMicrosoftToken returns null", async () => {
    const { getMicrosoftToken } = await import("../../src/sync/microsoft-auth.js");
    vi.mocked(getMicrosoftToken).mockResolvedValue(null);
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({ gmail: { enabled: false } }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--provider", "microsoft"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("no token found");
    consoleSpy.mockRestore();
  });
});

describe("syncCommand — transcripts no new files", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("shows 'no new files' when transcript dir has no matching extensions", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({ gmail: { enabled: false } }),
      [`${DATA_DIR}/.agentic/sources.json`]: JSON.stringify({
        transcripts: {
          enabled: true,
          paths: [`${DATA_DIR}/transcripts`],
          extensions: [".txt"],
        },
      }),
      // Only a .pdf file — won't match .txt extension
      [`${DATA_DIR}/transcripts/notes.pdf`]: "PDF content",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--transcripts"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("no new files");
    consoleSpy.mockRestore();
  });
});

describe("syncCommand — microsoft provider", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("runs microsoft sync with --provider microsoft", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({ gmail: { enabled: false } }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--provider", "microsoft"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Microsoft");
    consoleSpy.mockRestore();
  });
});

describe("syncCommand — google-drive provider", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("logs info when google-drive token not configured", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({ gmail: { enabled: false } }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--provider", "google-drive"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("token not configured");
    consoleSpy.mockRestore();
  });

  it("runs google drive sync when token exists", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({ gmail: { enabled: false } }),
      [`${DATA_DIR}/.agentic/google-token.json`]: JSON.stringify({ accessToken: "gtoken123" }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--provider", "google-drive"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Google Drive");
    consoleSpy.mockRestore();
  });

  it("uses access_token fallback when accessToken key is absent", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({ gmail: { enabled: false } }),
      [`${DATA_DIR}/.agentic/google-token.json`]: JSON.stringify({ access_token: "gtoken456" }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--provider", "google-drive"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Google Drive");
    consoleSpy.mockRestore();
  });

  it("logs info when token file has neither accessToken nor access_token", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({ gmail: { enabled: false } }),
      [`${DATA_DIR}/.agentic/google-token.json`]: JSON.stringify({ other_key: "no-token" }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--provider", "google-drive"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("accessToken not found");
    consoleSpy.mockRestore();
  });

  it("reports errors from google drive sync", async () => {
    const { syncGoogleDriveFiles } = await import("../../src/sync/google-drive-sync.js");
    vi.mocked(syncGoogleDriveFiles).mockResolvedValue({
      synced: 0,
      skipped: 0,
      errors: ["fetch error: timeout"],
    });
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({ gmail: { enabled: false } }),
      [`${DATA_DIR}/.agentic/google-token.json`]: JSON.stringify({ accessToken: "gtoken789" }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--provider", "google-drive"]);

    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("fetch error: timeout");
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("syncCommand — error catch blocks", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("logs transcript sync error when agentic sources.json is invalid JSON", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({ gmail: { enabled: false } }),
      [`${DATA_DIR}/.agentic/sources.json`]: "INVALID JSON{{",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--provider", "transcripts"]);

    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("Transcript sync failed");
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("logs google-drive error when token file contains invalid JSON", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({ gmail: { enabled: false } }),
      [`${DATA_DIR}/.agentic/google-token.json`]: "INVALID JSON{{",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--provider", "google-drive"]);

    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("Google Drive sync failed");
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("logs microsoft sync error when getMicrosoftToken throws", async () => {
    const { getMicrosoftToken } = await import("../../src/sync/microsoft-auth.js");
    vi.mocked(getMicrosoftToken).mockRejectedValue(new Error("auth error"));
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({ gmail: { enabled: false } }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--provider", "microsoft"]);

    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("Microsoft sync failed");
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("logs gmail sync error when getGmailAuth throws", async () => {
    const { getGmailAuth } = await import("../../src/sync/gmail-auth.js");
    vi.mocked(getGmailAuth).mockRejectedValue(new Error("token expired"));
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({
        gmail: { enabled: true, query: "from:acme.com" },
      }),
      [`${DATA_DIR}/.agentic/gmail-token.json`]: "{}",
      [`${DATA_DIR}/.agentic/gmail-credentials.json`]: "{}",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--gmail"]);

    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("Gmail sync failed");
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("syncCommand — transcript provider", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("processes transcript files when enabled in agentic sources", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({ gmail: { enabled: false } }),
      [`${DATA_DIR}/.agentic/sources.json`]: JSON.stringify({
        transcripts: {
          enabled: true,
          paths: [`${DATA_DIR}/transcripts`],
          extensions: [".txt"],
        },
      }),
      [`${DATA_DIR}/transcripts/meeting.txt`]: "Transcript content",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--provider", "transcripts"]);

    consoleSpy.mockRestore();
  });

  it("logs info when transcripts not configured in agentic sources", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/sources.json`]: JSON.stringify({ gmail: { enabled: false } }),
      [`${DATA_DIR}/.agentic/sources.json`]: JSON.stringify({
        transcripts: { enabled: false, paths: [], extensions: [".txt"] },
      }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { syncCommand } = await import("../../src/commands/sync.js");
    await syncCommand.parseAsync(["node", "sync", "acme", "--provider", "transcripts"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("not configured");
    consoleSpy.mockRestore();
  });
});
