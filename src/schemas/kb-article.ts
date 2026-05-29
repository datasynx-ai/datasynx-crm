import { z } from "zod";

export const KbArticleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.string().default("general"),
  tags: z.array(z.string()).default([]),
  public: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
  sourceTicketId: z.string().optional(),
});

export type KbArticleMeta = z.infer<typeof KbArticleSchema>;
export type KbArticle = KbArticleMeta & { body: string };
