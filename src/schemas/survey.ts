import { z } from "zod";

export const SurveyDefinitionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["nps", "csat", "ces"]).default("nps"),
  question: z.string().min(1),
  scale: z.object({ min: z.number().default(0), max: z.number().default(10) }).default({ min: 0, max: 10 }),
  includeComment: z.boolean().default(true),
  commentPrompt: z.string().optional(),
  createdAt: z.string(),
});

export const SurveyResponseSchema = z.object({
  surveyId: z.string(),
  slug: z.string(),
  contactEmail: z.string().email(),
  score: z.number().int(),
  comment: z.string().optional(),
  respondedAt: z.string(),
  token: z.string(),
  sentAt: z.string(),
});

export type SurveyDefinition = z.infer<typeof SurveyDefinitionSchema>;
export type SurveyResponse = z.infer<typeof SurveyResponseSchema>;
