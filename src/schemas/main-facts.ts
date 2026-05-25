import { z } from "zod";

export const MainFactsSchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  industry: z.string().optional(),
  relationship_stage: z.enum(["prospect", "active", "churned", "paused"]),
  deal_value: z.number().optional(),
  currency: z.string().default("EUR"),
  primary_contact: z.string().optional(),
  timezone: z.string().optional(),
  tags: z.array(z.string()).default([]),
  created: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
});

export type MainFacts = z.infer<typeof MainFactsSchema>;
