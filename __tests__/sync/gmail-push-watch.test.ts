import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  extractEmailBody,
  registerGmailWatch,
  fetchNewMessagesFromHistory,
  fetchFullMessage,
  type GmailPayload,
} from "../../src/sync/gmail-push-watch.js";

beforeEach(() => {
  vi.restoreAllMocks();
});

function b64url(text: string): string {
  return Buffer.from(text).toString("base64url");
}

// ─── extractEmailBody ─────────────────────────────────────────────────────────

describe("extractEmailBody", () => {
  it("decodes direct body data", () => {
    const payload: GmailPayload = { body: { data: b64url("Hello World") } };
    expect(extractEmailBody(payload)).toBe("Hello World");
  });

  it("returns text/plain from parts", () => {
    const payload: GmailPayload = {
      parts: [
        { mimeType: "text/html", body: { data: b64url("<p>html</p>") } },
        { mimeType: "text/plain", body: { data: b64url("plain text") } },
      ],
    };
    expect(extractEmailBody(payload)).toBe("plain text");
  });

  it("prefers text/plain over text/html", () => {
    const payload: GmailPayload = {
      parts: [
        { mimeType: "text/html", body: { data: b64url("<b>html</b>") } },
        { mimeType: "text/plain", body: { data: b64url("plain") } },
      ],
    };
    expect(extractEmailBody(payload)).toBe("plain");
  });

  it("falls back to text/html when no text/plain", () => {
    const payload: GmailPayload = {
      parts: [{ mimeType: "text/html", body: { data: b64url("<p>html</p>") } }],
    };
    expect(extractEmailBody(payload)).toBe("<p>html</p>");
  });

  it("finds text/plain in nested multipart", () => {
    const payload: GmailPayload = {
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: b64url("nested plain") } },
            { mimeType: "text/html", body: { data: b64url("<b>nested html</b>") } },
          ],
        },
      ],
    };
    expect(extractEmailBody(payload)).toBe("nested plain");
  });

  it("returns empty string for empty payload", () => {
    expect(extractEmailBody({})).toBe("");
  });

  it("returns empty string for payload with no body data", () => {
    const payload: GmailPayload = { parts: [{ mimeType: "text/plain", body: {} }] };
    expect(extractEmailBody(payload)).toBe("");
  });
});

// ─── registerGmailWatch ───────────────────────────────────────────────────────

describe("registerGmailWatch", () => {
  it("returns historyId and expiration on success", async () => {
    const mockResponse = { historyId: "12345", expiration: "1716898800000" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })
    );

    const result = await registerGmailWatch("token123", "projects/my-project/topics/gmail");
    expect(result.historyId).toBe("12345");
    expect(result.expiration).toBe("1716898800000");
  });

  it("posts to correct Gmail watch endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ historyId: "1", expiration: "0" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await registerGmailWatch("mytoken", "projects/p/topics/t");

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/watch");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>)["Authorization"]).toBe("Bearer mytoken");
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body["topicName"]).toBe("projects/p/topics/t");
    expect(body["labelIds"]).toContain("INBOX");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403 })
    );
    await expect(registerGmailWatch("bad-token", "topic")).rejects.toThrow(
      "Gmail watch registration failed: 403"
    );
  });
});

// ─── fetchNewMessagesFromHistory ──────────────────────────────────────────────

describe("fetchNewMessagesFromHistory", () => {
  it("returns messages from history entries", async () => {
    const mockData = {
      history: [
        {
          messagesAdded: [
            { message: { id: "msg1", threadId: "thread1" } },
            { message: { id: "msg2", threadId: "thread1" } },
          ],
        },
        {
          messagesAdded: [{ message: { id: "msg3", threadId: "thread2" } }],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockData) })
    );

    const messages = await fetchNewMessagesFromHistory("token", "99999");
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ id: "msg1", threadId: "thread1" });
    expect(messages[2]).toEqual({ id: "msg3", threadId: "thread2" });
  });

  it("returns empty array when history is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    );
    const messages = await fetchNewMessagesFromHistory("token", "1");
    expect(messages).toHaveLength(0);
  });

  it("includes startHistoryId in URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchNewMessagesFromHistory("t", "55555");
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("startHistoryId=55555");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 })
    );
    await expect(fetchNewMessagesFromHistory("bad", "1")).rejects.toThrow(
      "Gmail history fetch failed: 401"
    );
  });
});

// ─── fetchFullMessage ─────────────────────────────────────────────────────────

describe("fetchFullMessage", () => {
  function makeMessageResponse(subject = "Test Subject", body = "Email body text") {
    return {
      id: "msgABC",
      threadId: "threadXYZ",
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "Subject", value: subject },
          { name: "From", value: "sender@example.com" },
          { name: "Date", value: "Thu, 28 May 2026 10:00:00 +0000" },
        ],
        body: { data: b64url(body) },
      },
    };
  }

  it("returns id, threadId, subject, from, date, body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeMessageResponse()),
      })
    );

    const msg = await fetchFullMessage("token", "msgABC");
    expect(msg.id).toBe("msgABC");
    expect(msg.threadId).toBe("threadXYZ");
    expect(msg.subject).toBe("Test Subject");
    expect(msg.from).toBe("sender@example.com");
    expect(msg.date).toBe("Thu, 28 May 2026 10:00:00 +0000");
    expect(msg.body).toBe("Email body text");
  });

  it("header lookup is case-insensitive", async () => {
    const data = {
      id: "x",
      threadId: "y",
      payload: {
        headers: [
          { name: "subject", value: "lowercase subject" },
          { name: "FROM", value: "upper@example.com" },
          { name: "DATE", value: "2026-01-01" },
        ],
        body: { data: b64url("content") },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(data) })
    );

    const msg = await fetchFullMessage("token", "x");
    expect(msg.subject).toBe("lowercase subject");
    expect(msg.from).toBe("upper@example.com");
  });

  it("extracts body from multipart message", async () => {
    const data = {
      id: "m",
      threadId: "t",
      payload: {
        mimeType: "multipart/alternative",
        headers: [
          { name: "Subject", value: "S" },
          { name: "From", value: "f" },
          { name: "Date", value: "d" },
        ],
        parts: [
          { mimeType: "text/plain", body: { data: b64url("multipart plain") } },
          { mimeType: "text/html", body: { data: b64url("<b>html</b>") } },
        ],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(data) })
    );

    const msg = await fetchFullMessage("token", "m");
    expect(msg.body).toBe("multipart plain");
  });

  it("uses correct message URL with format=full", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeMessageResponse()),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchFullMessage("mytoken", "msg123");
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("messages/msg123");
    expect(url).toContain("format=full");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer mytoken");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 })
    );
    await expect(fetchFullMessage("t", "missing")).rejects.toThrow(
      "Gmail message fetch failed: 404"
    );
  });

  it("returns empty string for missing headers", async () => {
    const data = {
      id: "x",
      threadId: "y",
      payload: { headers: [], body: { data: b64url("body") } },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(data) })
    );

    const msg = await fetchFullMessage("t", "x");
    expect(msg.subject).toBe("");
    expect(msg.from).toBe("");
    expect(msg.date).toBe("");
  });
});
