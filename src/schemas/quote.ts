import { z } from "zod";

export const QuoteLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  total: z.number().min(0),
});

export const QuoteSchema = z.object({
  quoteNumber: z.string().regex(/^Q-\d{4}-\d{3,}$/),
  slug: z.string().min(1),
  dealName: z.string().min(1),
  lineItems: z.array(QuoteLineItemSchema).min(1),
  subtotal: z.number().min(0),
  vatPercent: z.number().min(0).max(100),
  vat: z.number().min(0),
  total: z.number().min(0),
  currency: z.string().default("EUR"),
  createdAt: z.string(),
  validUntilDays: z.number().int().positive().default(30),
  validUntil: z.string(),
  status: z.enum(["draft", "sent", "viewed", "accepted", "declined"]).default("draft"),
  viewedAt: z.string().optional(),
  acceptedAt: z.string().optional(),
  htmlPath: z.string().optional(),
});

export type QuoteLineItem = z.infer<typeof QuoteLineItemSchema>;
export type Quote = z.infer<typeof QuoteSchema>;
