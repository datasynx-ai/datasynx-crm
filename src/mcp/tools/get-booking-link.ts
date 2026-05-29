import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const DATA_DIR = process.cwd();

interface CalendlyConfig {
  apiKey?: string;
  defaultEventType?: string;
  autoLogMeetings?: boolean;
}

function loadCalendlyConfig(dataDir: string): CalendlyConfig {
  const p = path.join(dataDir, ".agentic", "integrations", "calendly.yaml");
  if (!fs.existsSync(p)) return {};
  try {
    return (yaml.load(fs.readFileSync(p, "utf-8") as string) as CalendlyConfig) ?? {};
  } catch {
    return {};
  }
}

function readCustomerFacts(dataDir: string, slug: string): { name?: string; email?: string } {
  const p = path.join(dataDir, "customers", slug, "main_facts.md");
  if (!fs.existsSync(p)) return {};
  const content = fs.readFileSync(p, "utf-8") as string;
  const nameMatch = /^name:\s*(.+)$/m.exec(content);
  const emailMatch = /^email:\s*(.+)$/m.exec(content);
  const name = nameMatch?.[1]?.trim();
  const email = emailMatch?.[1]?.trim();
  return {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
  };
}

export async function handleGetBookingLink(
  input: { slug: string; eventType?: string; prefillName?: boolean },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const config = loadCalendlyConfig(dataDir);
  const apiKey = config.apiKey ?? process.env["CALENDLY_API_KEY"] ?? "";

  if (!apiKey) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: "Calendly API key not configured. Set CALENDLY_API_KEY env var or configure .agentic/integrations/calendly.yaml",
        }),
      }],
    };
  }

  const eventTypeSlug = input.eventType ?? config.defaultEventType ?? "30min";

  try {
    const { getSchedulingLink, listEventTypes } = await import("../../sync/calendly.js");
    const prefill = input.prefillName ? readCustomerFacts(dataDir, input.slug) : undefined;
    const bookingUrl = await getSchedulingLink(apiKey, eventTypeSlug, prefill);

    const eventTypes = await listEventTypes(apiKey);
    const eventType = eventTypes.find((et) => et.slug === eventTypeSlug || et.name.toLowerCase().includes(eventTypeSlug.toLowerCase()));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          bookingUrl,
          eventType: eventType?.name ?? eventTypeSlug,
          duration: eventType?.duration ?? 30,
          slug: input.slug,
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: (err as Error).message }) }],
    };
  }
}

export function registerGetBookingLink(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "get_booking_link",
    {
      description: `Get a Calendly booking link for a customer. Optionally pre-fills the customer's name/email.
Requires CALENDLY_API_KEY env var or .agentic/integrations/calendly.yaml config.
Returns: { bookingUrl, eventType, duration }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        eventType: z.string().optional().describe("Calendly event type slug (e.g. '30min', '60min'). Uses default if not specified."),
        prefillName: z.boolean().optional().describe("Pre-fill customer name and email in the booking link"),
      }),
    },
    ({ slug, eventType, prefillName }) =>
      handleGetBookingLink(
        {
          slug,
          ...(eventType !== undefined ? { eventType } : {}),
          ...(prefillName !== undefined ? { prefillName } : {}),
        },
        dataDir
      )
  );
}
