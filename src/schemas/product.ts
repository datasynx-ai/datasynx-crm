import { z } from "zod";

/**
 * Reusable product / price catalog entry (#50). Lets quotes reference items by
 * SKU instead of re-typing prices each time.
 */
export const ProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  unitPrice: z.number().min(0),
  currency: z.string().default("EUR"),
  /** VAT / tax rate in percent (e.g. 19). */
  taxRate: z.number().min(0).max(100).optional(),
  /** Recurring billing cadence for subscriptions (quote-to-cash prep). */
  recurring: z.enum(["monthly", "yearly"]).optional(),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

export type Product = z.infer<typeof ProductSchema>;
