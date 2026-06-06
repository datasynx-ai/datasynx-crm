import { z } from "zod";

export const GmailSourceSchema = z.object({
  type: z.literal("gmail"),
  query: z.string(),
  enabled: z.boolean().default(true),
});

export const TranscriptSourceSchema = z.object({
  type: z.literal("transcript"),
  paths: z.array(z.string()),
  extensions: z.array(z.string()).default([".txt", ".vtt"]),
  enabled: z.boolean().default(true),
});

export const GlobalSourcesSchema = z.object({
  gmail: GmailSourceSchema.optional(),
  calendar: z.object({ enabled: z.boolean().default(true) }).optional(),
  transcripts: TranscriptSourceSchema.optional(),
  version: z.number().default(1),
  created: z.string(),
});

export type GlobalSources = z.infer<typeof GlobalSourcesSchema>;
