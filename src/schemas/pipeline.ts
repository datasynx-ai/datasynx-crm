import { z } from "zod";

export const PipelineDealSchema = z.object({
  name: z.string().min(1),
  stage: z.enum(["lead", "qualified", "proposal", "negotiation", "won", "lost"]),
  value: z.number().optional(),
  currency: z.string().default("EUR"),
  probability: z.number().min(0).max(100).optional(),
  close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required")
    .optional(),
  notes: z.string().optional(),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
});

export type PipelineDeal = z.infer<typeof PipelineDealSchema>;
