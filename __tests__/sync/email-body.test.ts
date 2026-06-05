import { describe, it, expect } from "vitest";
import { collectBodyParts, extractEmailBodyMarkdown } from "../../src/sync/email-body.js";

function b64url(s: string): string {
  return Buffer.from(s).toString("base64url");
}

describe("collectBodyParts", () => {
  it("decodes a simple text/plain body from the top-level payload", () => {
    const payload = { mimeType: "text/plain", body: { data: b64url("hello world") } };
    expect(collectBodyParts(payload as never)).toEqual({ plain: "hello world" });
  });

  it("collects both plain and html from a multipart/alternative", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64url("plain version") } },
        { mimeType: "text/html", body: { data: b64url("<p>html version</p>") } },
      ],
    };
    expect(collectBodyParts(payload as never)).toEqual({
      plain: "plain version",
      html: "<p>html version</p>",
    });
  });

  it("ignores attachment parts", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { data: b64url("body") } },
        {
          mimeType: "text/plain",
          filename: "note.txt",
          body: { data: b64url("attached"), attachmentId: "a1" },
        },
      ],
    };
    expect(collectBodyParts(payload as never).plain).toBe("body");
  });

  it("keeps the first body of each type", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { data: b64url("first") } },
        { mimeType: "text/plain", body: { data: b64url("second") } },
      ],
    };
    expect(collectBodyParts(payload as never).plain).toBe("first");
  });
});

describe("extractEmailBodyMarkdown", () => {
  it("prefers the plain-text body verbatim", async () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64url("# not converted") } },
        { mimeType: "text/html", body: { data: b64url("<h1>converted</h1>") } },
      ],
    };
    expect(await extractEmailBodyMarkdown(payload as never)).toBe("# not converted");
  });

  it("converts HTML to Markdown when no plain part exists", async () => {
    const payload = { mimeType: "text/html", body: { data: b64url("<h1>Title</h1>") } };
    expect(await extractEmailBodyMarkdown(payload as never)).toBe("# Title");
  });

  it("returns empty string for an attachment-only message", async () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [{ mimeType: "application/pdf", filename: "x.pdf", body: { attachmentId: "a1" } }],
    };
    expect(await extractEmailBodyMarkdown(payload as never)).toBe("");
  });
});
