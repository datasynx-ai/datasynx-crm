import { describe, it, expect, vi } from "vitest";

function ok(): { ok: boolean; status: number; text: () => Promise<string> } {
  return { ok: true, status: 200, text: async () => "{}" };
}
function fail(status: number): { ok: boolean; status: number; text: () => Promise<string> } {
  return { ok: false, status, text: async () => `{"error":"status ${status}"}` };
}

const BASE = {
  token: "tok",
  phoneId: "12345",
  to: "+15551234567",
  text: "hello",
  retryDelayMs: 1,
};

describe("sendWhatsAppText (#67)", () => {
  it("POSTs the Cloud API message payload", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok());
    const { sendWhatsAppText } = await import("../../src/sync/whatsapp-send.js");
    await sendWhatsAppText({ ...BASE, fetchFn: fetchFn as never });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/12345/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    );
    const body = JSON.parse((fetchFn.mock.calls[0]![1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      messaging_product: "whatsapp",
      to: "+15551234567",
      type: "text",
      text: { body: "hello" },
    });
  });

  it("fails fast on auth errors (401) — no retry", async () => {
    const fetchFn = vi.fn().mockResolvedValue(fail(401));
    const { sendWhatsAppText } = await import("../../src/sync/whatsapp-send.js");
    await expect(sendWhatsAppText({ ...BASE, fetchFn: fetchFn as never })).rejects.toThrow(/401/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("retries 5xx and succeeds", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(fail(500)).mockResolvedValueOnce(ok());
    const { sendWhatsAppText } = await import("../../src/sync/whatsapp-send.js");
    await sendWhatsAppText({ ...BASE, fetchFn: fetchFn as never });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries 429 and network errors, then gives up with the last error", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(fail(429))
      .mockResolvedValueOnce(fail(503));
    const { sendWhatsAppText } = await import("../../src/sync/whatsapp-send.js");
    await expect(sendWhatsAppText({ ...BASE, fetchFn: fetchFn as never })).rejects.toThrow(/503/);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
