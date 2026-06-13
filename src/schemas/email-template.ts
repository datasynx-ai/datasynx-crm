import { z } from "zod";

export const EmailTemplateSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  category: z.string().default("general"),
  variables: z.array(z.string()).default([]),
  language: z.string().default("de"),
  starter: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

export type EmailTemplateMeta = z.infer<typeof EmailTemplateSchema>;

export interface EmailTemplate extends EmailTemplateMeta {
  body: string;
}
