export interface GmailPayload {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPayload[];
}

export function extractEmailBody(payload: GmailPayload): string {
  // If there's direct body data, decode it
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  // Search parts for text/plain first
  for (const part of payload.parts ?? []) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
  }

  // Recurse into multipart parts to find text/plain
  for (const part of payload.parts ?? []) {
    if (part.parts) {
      const found = extractEmailBody(part);
      if (found) return found;
    }
  }

  // Fall back to text/html
  for (const part of payload.parts ?? []) {
    if (part.mimeType === "text/html" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
  }

  // Recurse for html fallback
  for (const part of payload.parts ?? []) {
    if (part.parts) {
      const found = extractEmailBody(part);
      if (found) return found;
    }
  }

  return "";
}

export interface WatchRegistration {
  historyId: string;
  expiration: string;
}

export async function registerGmailWatch(
  accessToken: string,
  topicName: string
): Promise<WatchRegistration> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ topicName, labelIds: ["INBOX"] }),
  });
  if (!res.ok) {
    throw new Error(`Gmail watch registration failed: ${res.status}`);
  }
  return res.json() as Promise<WatchRegistration>;
}

export interface HistoryMessage {
  id: string;
  threadId: string;
}

export async function fetchNewMessagesFromHistory(
  accessToken: string,
  startHistoryId: string
): Promise<HistoryMessage[]> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail history fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    history?: Array<{
      messagesAdded?: Array<{ message: { id: string; threadId: string } }>;
    }>;
    historyId?: string;
  };

  const messages: HistoryMessage[] = [];
  for (const entry of data.history ?? []) {
    for (const added of entry.messagesAdded ?? []) {
      messages.push({ id: added.message.id, threadId: added.message.threadId });
    }
  }
  return messages;
}

export async function fetchFullMessage(
  accessToken: string,
  messageId: string
): Promise<{ id: string; threadId: string; subject: string; from: string; date: string; body: string }> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail message fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    id: string;
    threadId: string;
    payload: {
      mimeType?: string;
      headers: Array<{ name: string; value: string }>;
      body?: { data?: string };
      parts?: GmailPayload[];
    };
  };

  const headers = data.payload.headers;
  const getHeader = (name: string): string =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  const body = extractEmailBody({
    ...(data.payload.mimeType !== undefined ? { mimeType: data.payload.mimeType } : {}),
    ...(data.payload.body !== undefined ? { body: data.payload.body } : {}),
    ...(data.payload.parts !== undefined ? { parts: data.payload.parts } : {}),
  });

  return {
    id: data.id,
    threadId: data.threadId,
    subject: getHeader("Subject"),
    from: getHeader("From"),
    date: getHeader("Date"),
    body,
  };
}
