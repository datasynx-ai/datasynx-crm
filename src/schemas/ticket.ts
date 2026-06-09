import { z } from "zod";

export const TicketStatusSchema = z.enum(["open", "in-progress", "waiting", "resolved", "closed"]);
export const TicketPrioritySchema = z.enum(["urgent", "high", "normal", "low"]);

export const TicketSchema = z.object({
  id: z.string().regex(/^T-\d{3,}$/),
  title: z.string().min(1),
  status: TicketStatusSchema,
  priority: TicketPrioritySchema.default("normal"),
  assignee: z.string().optional(),
  created: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slaDue: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  resolved: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  description: z.string().optional(),
  /** Routing tags (#59), e.g. "billing", "technical". */
  tags: z.array(z.string()).optional(),
  /** Set once a pre-breach SLA warning was sent (one warning per ticket). */
  slaWarnedAt: z.string().optional(),
  /** Set once the ticket was escalated after an SLA breach (one escalation). */
  escalatedAt: z.string().optional(),
});

export type Ticket = z.infer<typeof TicketSchema>;
export type TicketStatus = z.infer<typeof TicketStatusSchema>;
export type TicketPriority = z.infer<typeof TicketPrioritySchema>;
