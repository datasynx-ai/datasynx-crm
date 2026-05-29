import fs from "fs";
import path from "path";
import { appendInteraction } from "../fs/interactions-writer.js";

export interface CalendlyWebhookPayload {
  event: string;
  payload: {
    event_type?: { name?: string; duration?: number };
    scheduled_event?: {
      name?: string;
      start_time?: string;
      end_time?: string;
      uri?: string;
    };
    invitee?: {
      name?: string;
      email?: string;
    };
    name?: string;
    email?: string;
    scheduled_event_uuid?: string;
  };
}

function resolveSlugByEmail(dataDir: string, email: string): string | null {
  const customersDir = path.join(dataDir, "customers");
  if (!fs.existsSync(customersDir)) return null;
  const slugs = fs.readdirSync(customersDir).filter((s) => {
    try { return fs.statSync(path.join(customersDir, s)).isDirectory(); } catch { return false; }
  });
  for (const slug of slugs) {
    const factsPath = path.join(customersDir, slug, "main_facts.md");
    if (!fs.existsSync(factsPath)) continue;
    const content = fs.readFileSync(factsPath, "utf-8") as string;
    const emailMatch = /^email:\s*(.+)$/m.exec(content);
    if (emailMatch?.[1]?.trim().toLowerCase() === email.toLowerCase()) return slug;
  }
  return null;
}

export async function handleCalendlyWebhook(payload: CalendlyWebhookPayload, dataDir: string): Promise<void> {
  if (payload.event !== "invitee.created") return;

  const invitee = payload.payload.invitee;
  const scheduled = payload.payload.scheduled_event;
  const inviteeEmail = invitee?.email ?? payload.payload.email ?? "";
  const inviteeName = invitee?.name ?? payload.payload.name ?? "";
  const eventName = scheduled?.name ?? payload.payload.event_type?.name ?? "Meeting";
  const startTime = scheduled?.start_time ?? "";
  const date = startTime.slice(0, 10) || new Date().toISOString().slice(0, 10);

  if (!inviteeEmail) return;

  const slug = resolveSlugByEmail(dataDir, inviteeEmail);
  if (!slug) return;

  const eventUri = scheduled?.uri ?? payload.payload.scheduled_event_uuid ?? "";
  const sourceRef = eventUri ? `calendly://event/${eventUri.split("/").pop()}` : `calendly://event/${Date.now()}`;

  await appendInteraction(dataDir, slug, {
    date,
    type: "Meeting",
    with: inviteeName || inviteeEmail,
    summary: `Meeting booked via Calendly: ${eventName}${inviteeName ? ` with ${inviteeName}` : ""}`,
    nextSteps: [],
    sourceRef,
    synced: new Date().toISOString(),
  });
}
