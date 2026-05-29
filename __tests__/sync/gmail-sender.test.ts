import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.hoisted(() => vi.fn());

vi.mock("googleapis", () => ({
  google: {
    gmail: vi.fn().mockReturnValue({
      users: { messages: { send: mockSend } },
    }),
    auth: { OAuth2: vi.fn() },
  },
}));

const fakeAuth = {} as import("googleapis").Auth.OAuth2Client;

describe("sendEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: "msg123", threadId: "thread456" } });
  });

  it("sends with correct base64url-encoded MIME", async () => {
    const { sendEmail } = await import("../../src/sync/gmail-sender.js");
    const result = await sendEmail({ auth: fakeAuth, to: "alice@acme.com", subject: "Hello", body: "World" });
    expect(result.messageId).toBe("msg123");
    expect(result.threadId).toBe("thread456");
    expect(mockSend).toHaveBeenCalledOnce();
    const { requestBody } = mockSend.mock.calls[0]![0] as { requestBody: { raw: string } };
    const decoded = Buffer.from(requestBody.raw, "base64url").toString();
    expect(decoded).toContain("To: alice@acme.com");
    expect(decoded).toContain("Subject: Hello");
    expect(decoded).toContain("World");
  });

  it("sets Content-Type to text/html by default", async () => {
    const { sendEmail } = await import("../../src/sync/gmail-sender.js");
    await sendEmail({ auth: fakeAuth, to: "x@y.com", subject: "s", body: "<b>hi</b>" });
    const { requestBody } = mockSend.mock.calls[0]![0] as { requestBody: { raw: string } };
    const decoded = Buffer.from(requestBody.raw, "base64url").toString();
    expect(decoded).toContain("text/html");
  });

  it("sets Content-Type to text/plain when isHtml=false", async () => {
    const { sendEmail } = await import("../../src/sync/gmail-sender.js");
    await sendEmail({ auth: fakeAuth, to: "x@y.com", subject: "s", body: "plain", isHtml: false });
    const { requestBody } = mockSend.mock.calls[0]![0] as { requestBody: { raw: string } };
    const decoded = Buffer.from(requestBody.raw, "base64url").toString();
    expect(decoded).toContain("text/plain");
  });

  it("adds In-Reply-To header when replyToMessageId provided", async () => {
    const { sendEmail } = await import("../../src/sync/gmail-sender.js");
    await sendEmail({ auth: fakeAuth, to: "x@y.com", subject: "re", body: "ok", replyToMessageId: "orig123" });
    const { requestBody } = mockSend.mock.calls[0]![0] as { requestBody: { raw: string } };
    const decoded = Buffer.from(requestBody.raw, "base64url").toString();
    expect(decoded).toContain("In-Reply-To: orig123");
    expect(decoded).toContain("References: orig123");
  });

  it("adds Cc header when cc provided", async () => {
    const { sendEmail } = await import("../../src/sync/gmail-sender.js");
    await sendEmail({ auth: fakeAuth, to: "a@b.com", subject: "s", body: "b", cc: ["c@d.com", "e@f.com"] });
    const { requestBody } = mockSend.mock.calls[0]![0] as { requestBody: { raw: string } };
    const decoded = Buffer.from(requestBody.raw, "base64url").toString();
    expect(decoded).toContain("Cc: c@d.com, e@f.com");
  });

  it("propagates API errors", async () => {
    mockSend.mockRejectedValueOnce(new Error("API down"));
    const { sendEmail } = await import("../../src/sync/gmail-sender.js");
    await expect(sendEmail({ auth: fakeAuth, to: "x@y.com", subject: "s", body: "b" })).rejects.toThrow("API down");
  });

  it("handles missing id/threadId gracefully", async () => {
    mockSend.mockResolvedValueOnce({ data: {} });
    const { sendEmail } = await import("../../src/sync/gmail-sender.js");
    const result = await sendEmail({ auth: fakeAuth, to: "x@y.com", subject: "s", body: "b" });
    expect(result.messageId).toBe("");
    expect(result.threadId).toBe("");
  });
});
