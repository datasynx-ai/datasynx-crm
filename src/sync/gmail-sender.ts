import { google, type Auth } from "googleapis";

export interface SendEmailOpts {
  auth: Auth.OAuth2Client;
  to: string;
  subject: string;
  body: string;             // HTML or plain text
  isHtml?: boolean;         // default true
  replyToMessageId?: string;
  cc?: string[];
}

export interface SendEmailResult {
  messageId: string;
  threadId: string;
}

function buildMime(opts: SendEmailOpts): string {
  const isHtml = opts.isHtml !== false;
  const contentType = isHtml ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";
  const lines: string[] = [
    `To: ${opts.to}`,
    ...(opts.cc && opts.cc.length > 0 ? [`Cc: ${opts.cc.join(", ")}`] : []),
    `Subject: ${opts.subject}`,
    `Content-Type: ${contentType}`,
    `MIME-Version: 1.0`,
    ...(opts.replyToMessageId
      ? [
          `In-Reply-To: ${opts.replyToMessageId}`,
          `References: ${opts.replyToMessageId}`,
        ]
      : []),
  ];
  return `${lines.join("\r\n")}\r\n\r\n${opts.body}`;
}

export async function sendEmail(opts: SendEmailOpts): Promise<SendEmailResult> {
  const gmail = google.gmail({ version: "v1", auth: opts.auth });
  const raw = Buffer.from(buildMime(opts)).toString("base64url");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return {
    messageId: res.data.id ?? "",
    threadId: res.data.threadId ?? "",
  };
}
