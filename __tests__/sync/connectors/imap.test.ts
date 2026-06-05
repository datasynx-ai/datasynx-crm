import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("../../../src/core/lancedb.js", () => ({
  indexInLanceDB: vi.fn().mockResolvedValue(undefined),
  searchKnowledge: vi.fn().mockResolvedValue([]),
  resetConnection: vi.fn(),
}));

import {
  normalizeParsedEmail,
  syncImapMailbox,
  type ImapClient,
  type ImapMessage,
} from "../../../src/sync/connectors/imap.js";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
});

function fakeClient(messages: ImapMessage[]): ImapClient {
  return {
    connect: () => Promise.resolve(),
    getMailboxLock: () => Promise.resolve({ release: () => undefined }),
    // eslint-disable-next-line @typescript-eslint/require-await
    fetch: async function* () {
      for (const m of messages) yield m;
    },
    logout: () => Promise.resolve(),
  };
}

function eml(opts: {
  from: string;
  to: string;
  subject: string;
  id: string;
  body: string;
}): Buffer {
  return Buffer.from(
    [
      `From: ${opts.from}`,
      `To: ${opts.to}`,
      `Subject: ${opts.subject}`,
      "Date: Wed, 03 Jun 2026 10:00:00 +0000",
      `Message-ID: <${opts.id}>`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      opts.body,
    ].join("\r\n")
  );
}

const config = {
  host: "imap.example.com",
  auth: { user: "me@myco.com", pass: "secret" },
};

describe("normalizeParsedEmail", () => {
  it("prefers plain text and maps attachments", async () => {
    const msg = await normalizeParsedEmail(
      {
        messageId: "<xyz@acme.com>",
        fromText: "Buyer <buyer@acme.com>",
        toAddresses: ["me@myco.com"],
        subject: "Order",
        date: new Date("2026-06-02T00:00:00Z"),
        text: "plain body",
        html: "<h1>ignored</h1>",
        attachments: [{ filename: "a.csv", contentType: "text/csv", content: Buffer.from("x,y") }],
      },
      { user: "me@myco.com", host: "imap.example.com", mailbox: "INBOX", uid: 7 }
    );
    expect(msg.messageId).toBe("xyz@acme.com");
    expect(msg.bodyMarkdown).toBe("plain body");
    expect(msg.toAddresses).toContain("me@myco.com");
    expect(msg.attachments).toHaveLength(1);
    expect(msg.sourceRef).toBe("imap://me@myco.com@imap.example.com/INBOX/7");
  });

  it("falls back to HTML→Markdown when there is no plain text", async () => {
    const msg = await normalizeParsedEmail(
      { html: "<h2>Hi</h2>", date: new Date("2026-06-02T00:00:00Z") },
      { user: "u", host: "h", mailbox: "INBOX", uid: 1 }
    );
    expect(msg.bodyMarkdown).toBe("## Hi");
  });
});

describe("syncImapMailbox", () => {
  it("auto-routes messages to customers by domain", async () => {
    vol.fromJSON({
      "/data/customers/acme/main_facts.md": "---\nname: Acme\ndomain: acme.com\n---\n",
      "/data/customers/acme/interactions.md": "# Interactions\n",
    });

    const messages = [
      {
        uid: 1,
        source: eml({
          from: "Buyer <buyer@acme.com>",
          to: "me@myco.com",
          subject: "Hi",
          id: "m1@acme.com",
          body: "Hello from acme",
        }),
      },
    ];

    const res = await syncImapMailbox({
      dataDir: "/data",
      config,
      clientFactory: () => fakeClient(messages),
    });

    expect(res.synced).toBe(1);
    expect(res.unrouted).toBe(0);
    const interactions = vol.toJSON()["/data/customers/acme/interactions.md"] as string;
    expect(interactions).toContain("imap://me@myco.com@imap.example.com/INBOX/1");
  });

  it("counts messages that match no customer as unrouted", async () => {
    vol.fromJSON({
      "/data/customers/acme/main_facts.md": "---\nname: Acme\ndomain: acme.com\n---\n",
    });
    const messages = [
      {
        uid: 2,
        source: eml({
          from: "x@stranger.net",
          to: "me@myco.com",
          subject: "Spam",
          id: "m2@x.net",
          body: "hi",
        }),
      },
    ];
    const res = await syncImapMailbox({
      dataDir: "/data",
      config,
      clientFactory: () => fakeClient(messages),
    });
    expect(res.synced).toBe(0);
    expect(res.unrouted).toBe(1);
  });

  it("dedups already-synced messages by sourceRef", async () => {
    vol.fromJSON({
      "/data/customers/acme/main_facts.md": "---\nname: Acme\ndomain: acme.com\n---\n",
      "/data/customers/acme/interactions.md":
        "# Interactions\n\n**Source:** imap://me@myco.com@imap.example.com/INBOX/3\n",
    });
    const messages = [
      {
        uid: 3,
        source: eml({
          from: "buyer@acme.com",
          to: "me@myco.com",
          subject: "Dup",
          id: "m3@acme.com",
          body: "again",
        }),
      },
    ];
    const res = await syncImapMailbox({
      dataDir: "/data",
      config,
      clientFactory: () => fakeClient(messages),
    });
    expect(res.skipped).toBe(1);
    expect(res.synced).toBe(0);
  });

  it("routes to a fixed slug when provided (no auto-routing)", async () => {
    vol.fromJSON({
      "/data/customers/vip/main_facts.md": "---\nname: VIP\n---\n",
      "/data/customers/vip/interactions.md": "# Interactions\n",
    });
    const messages = [
      {
        uid: 4,
        source: eml({
          from: "anyone@unknown.org",
          to: "me@myco.com",
          subject: "Hi",
          id: "m4@u.org",
          body: "to vip",
        }),
      },
    ];
    const res = await syncImapMailbox({
      dataDir: "/data",
      config,
      slug: "vip",
      clientFactory: () => fakeClient(messages),
    });
    expect(res.synced).toBe(1);
    expect(vol.toJSON()["/data/customers/vip/interactions.md"]).toContain("to vip"[0]);
  });
});
