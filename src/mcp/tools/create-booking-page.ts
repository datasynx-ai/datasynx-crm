import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createBookingPage,
  buildBookingLink,
  type CreateBookingPageInput,
} from "../../core/booking.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleCreateBookingPage(
  input: CreateBookingPageInput,
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const page = createBookingPage(dataDir, input);
  const url = buildBookingLink(page.id);
  const embedSnippet = `<a href="${url}">Book a meeting</a>`;
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ page, url, embedSnippet }, null, 2),
      },
    ],
  };
}

export function registerCreateBookingPage(server: McpServer): void {
  server.registerTool(
    "create_booking_page",
    {
      title: "Create Booking Page",
      description: `Create a native meeting-scheduler page (#53): a public booking page that shows
REAL free slots derived from the connected calendars, distributes team bookings
round-robin across the listed reps, writes a calendar event and logs a Meeting
interaction on confirmation (fires meeting.booked for workflows). Local-first:
with no connected calendar every rep is treated as free. The Calendly
get_booking_link tool stays as a fallback.

Returns: { page, url, embedSnippet }`,
      inputSchema: z.object({
        id: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]*$/)
          .describe("URL-safe page id, e.g. 'sales-demo' → /book/sales-demo"),
        title: z.string().describe("Heading shown on the booking page"),
        reps: z.array(z.string()).min(1).describe("RBAC actor names bookings round-robin across"),
        durationMin: z.number().int().positive().optional().describe("Slot length (default 30)"),
        bufferMin: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Gap before/after a meeting (default 0)"),
        days: z.number().int().positive().optional().describe("Days ahead to offer (default 14)"),
        startHour: z
          .number()
          .int()
          .min(0)
          .max(23)
          .optional()
          .describe("Working-hours start, UTC (default 9)"),
        endHour: z
          .number()
          .int()
          .min(1)
          .max(24)
          .optional()
          .describe("Working-hours end, UTC (default 17)"),
        slotStepMin: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Slot granularity (default = duration)"),
        slug: z
          .string()
          .optional()
          .describe("Customer slug to log against (else routed by email domain)"),
        location: z.string().optional().describe("Optional location / video link label"),
      }),
    },
    async (args) => handleCreateBookingPage(args as CreateBookingPageInput)
  );
}
