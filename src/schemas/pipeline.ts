import { z } from "zod";

export const PipelineDealSchema = z.object({
  name: z.string().min(1),
  /** Stage id. Validated against the deal's pipeline definition at write time
   * (issue #47); every pipeline keeps `won`/`lost` as its final stages. */
  stage: z.string().min(1),
  /** Pipeline this deal belongs to; missing = the default pipeline. */
  pipeline: z.string().optional(),
  value: z.number().optional(),
  currency: z.string().default("EUR"),
  probability: z.number().min(0).max(100).optional(),
  close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required")
    .optional(),
  notes: z.string().optional(),
  /** Deal owner / responsible rep (RBAC actor id). Optional; resolved from the
   * customer's RBAC owner or the audit trail when absent (issue #51). */
  owner: z.string().optional(),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
});

export type PipelineDeal = z.infer<typeof PipelineDealSchema>;
