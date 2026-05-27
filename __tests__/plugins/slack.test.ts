import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createSlackPlugin", () => {
  it("returns an object with DxcrmPlugin fields", async () => {
    const { createSlackPlugin } = await import("../../src/plugins/slack.js");
    const plugin = createSlackPlugin({ webhookUrl: "https://hooks.slack.com/test", notifyOn: [] });
    expect(plugin.name).toBe("slack");
    expect(plugin.version).toBeDefined();
    expect(plugin.description).toBeDefined();
  });

  describe("afterLogInteraction", () => {
    it("calls fetch when notifyOn includes new_interaction", async () => {
      const { createSlackPlugin } = await import("../../src/plugins/slack.js");
      const plugin = createSlackPlugin({
        webhookUrl: "https://hooks.slack.com/test",
        notifyOn: ["new_interaction"],
      });
      await (plugin as { afterLogInteraction(slug: string, summary: string): Promise<void> }).afterLogInteraction("acme-corp", "Had a great call");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]![0]).toBe("https://hooks.slack.com/test");
    });

    it("does NOT call fetch when notifyOn excludes new_interaction", async () => {
      const { createSlackPlugin } = await import("../../src/plugins/slack.js");
      const plugin = createSlackPlugin({
        webhookUrl: "https://hooks.slack.com/test",
        notifyOn: ["deal_won"],
      });
      await (plugin as { afterLogInteraction(slug: string, summary: string): Promise<void> }).afterLogInteraction("acme-corp", "Had a great call");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("afterDealUpdate", () => {
    it("sends won notification when stage=won", async () => {
      const { createSlackPlugin } = await import("../../src/plugins/slack.js");
      const plugin = createSlackPlugin({
        webhookUrl: "https://hooks.slack.com/test",
        notifyOn: ["deal_won"],
      });
      await (plugin as { afterDealUpdate(slug: string, dealName: string, stage: string): Promise<void> }).afterDealUpdate("acme-corp", "Enterprise Deal", "won");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as { text: string };
      expect(body.text).toContain("WON");
    });

    it("sends lost notification when stage=lost", async () => {
      const { createSlackPlugin } = await import("../../src/plugins/slack.js");
      const plugin = createSlackPlugin({
        webhookUrl: "https://hooks.slack.com/test",
        notifyOn: ["deal_lost"],
      });
      await (plugin as { afterDealUpdate(slug: string, dealName: string, stage: string): Promise<void> }).afterDealUpdate("acme-corp", "Enterprise Deal", "lost");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as { text: string };
      expect(body.text).toContain("LOST");
    });

    it("does not send when stage=qualified (not final)", async () => {
      const { createSlackPlugin } = await import("../../src/plugins/slack.js");
      const plugin = createSlackPlugin({
        webhookUrl: "https://hooks.slack.com/test",
        notifyOn: ["deal_won", "deal_lost"],
      });
      await (plugin as { afterDealUpdate(slug: string, dealName: string, stage: string): Promise<void> }).afterDealUpdate("acme-corp", "Enterprise Deal", "qualified");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("onInstall", () => {
    it("sends a test message on install", async () => {
      const { createSlackPlugin } = await import("../../src/plugins/slack.js");
      const plugin = createSlackPlugin({
        webhookUrl: "https://hooks.slack.com/test",
        notifyOn: [],
      });
      await plugin.onInstall?.();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
