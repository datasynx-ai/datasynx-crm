import { z } from "zod";

export const InteractionEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  type: z.enum(["Email", "Call", "Meeting", "Note", "Demo", "Proposal", "Contract", "Other"]),
  direction: z.enum(["inbound", "outbound"]).optional(),
  with: z.string().min(1),
  subject: z.string().optional(),
  summary: z.string().min(1),
  nextSteps: z.array(z.string()).default([]),
  /** Relative links (from the customer dir) to converted attachment Markdown. */
  attachments: z.array(z.string()).optional(),
  sourceRef: z.string().min(1),
  synced: z.string().min(1),
});

export type InteractionEntry = z.infer<typeof InteractionEntrySchema>;
