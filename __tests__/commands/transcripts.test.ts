import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const mockMsToken = vi.hoisted(() => vi.fn());
const mockGoogleToken = vi.hoisted(() => vi.fn());
vi.mock("../../src/sync/microsoft-auth.js", () => ({ getMicrosoftToken: mockMsToken }));
vi.mock("../../src/sync/google-auth.js", () => ({ getGoogleToken: mockGoogleToken }));

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
  vol.fromJSON({ "/data/.agentic/.keep": "" });
  vi.spyOn(process, "cwd").mockReturnValue("/data");
  process.exitCode = 0;
});

describe("runTranscriptsSubscribe (#63)", () => {
  it("fails clearly when no Microsoft token is available", async () => {
    mockMsToken.mockResolvedValue(null);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { runTranscriptsSubscribe } = await import("../../src/commands/transcripts.js");
    await runTranscriptsSubscribe("teams", { url: "https://crm.example.com" });
    expect(process.exitCode).toBe(1);
    expect(errSpy.mock.calls.flat().join(" ")).toContain("Microsoft");
    errSpy.mockRestore();
  });

  it("requires --url (or DXCRM_PUBLIC_URL) for teams", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { runTranscriptsSubscribe } = await import("../../src/commands/transcripts.js");
    await runTranscriptsSubscribe("teams", {});
    expect(process.exitCode).toBe(1);
    expect(errSpy.mock.calls.flat().join(" ")).toContain("--url");
    errSpy.mockRestore();
  });

  it("requires --topic for meet", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { runTranscriptsSubscribe } = await import("../../src/commands/transcripts.js");
    await runTranscriptsSubscribe("meet", {});
    expect(process.exitCode).toBe(1);
    expect(errSpy.mock.calls.flat().join(" ")).toContain("--topic");
    errSpy.mockRestore();
  });

  it("rejects unknown providers", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { runTranscriptsSubscribe } = await import("../../src/commands/transcripts.js");
    await runTranscriptsSubscribe("zoom", {});
    expect(process.exitCode).toBe(1);
    errSpy.mockRestore();
  });

  it("creates and prints the teams subscription with a token", async () => {
    mockMsToken.mockResolvedValue("tok");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "graph-1", expirationDateTime: "2026-06-13T00:00:00Z" }),
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runTranscriptsSubscribe } = await import("../../src/commands/transcripts.js");
    await runTranscriptsSubscribe("teams", { url: "https://crm.example.com" });

    expect(process.exitCode).toBe(0);
    const out = logSpy.mock.calls.flat().join("\n");
    expect(out).toContain("psub_");
    expect(out).toContain("communications/onlineMeetings/getAllTranscripts");

    const { readSubscriptions } = await import("../../src/sync/push-manager.js");
    expect(await readSubscriptions("/data")).toHaveLength(1);

    fetchSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe("runTranscriptsSubscriptions (#63)", () => {
  it("hints at subscribe when the store is empty", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { runTranscriptsSubscriptions } = await import("../../src/commands/transcripts.js");
    await runTranscriptsSubscriptions();
    expect(logSpy.mock.calls.flat().join(" ")).toContain("transcripts subscribe");
    logSpy.mockRestore();
  });

  it("lists transcript subscriptions but not mailbox push subs", async () => {
    const { register } = await import("../../src/sync/push-manager.js");
    await register("/data", "google-workspace", "*", { webhookUrl: "projects/p/topics/t" });
    await register("/data", "microsoft-graph", "*", {
      webhookUrl: "https://x/webhooks/microsoft",
      providerData: { microsoftResource: "communications/onlineMeetings/getAllTranscripts" },
    });
    await register("/data", "gmail", "acme", { webhookUrl: "https://x/webhooks/gmail" });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { runTranscriptsSubscriptions } = await import("../../src/commands/transcripts.js");
    await runTranscriptsSubscriptions();
    const out = logSpy.mock.calls.flat().join("\n");
    expect(out).toContain("2 transcript subscription(s)");
    expect(out).toContain("google-workspace");
    expect(out).not.toContain("gmail");
    logSpy.mockRestore();
  });
});
