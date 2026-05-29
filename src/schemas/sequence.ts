import { z } from "zod";

export const SequenceStepSchema = z.object({
  day: z.number().int().min(0),
  templateId: z.string().min(1),
  skipIfReplied: z.boolean().default(true),
});

export const SequenceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  steps: z.array(SequenceStepSchema).min(1),
  createdAt: z.string(),
});

export const SequenceEnrollmentSchema = z.object({
  id: z.string(),
  sequenceId: z.string(),
  slug: z.string(),
  contactEmail: z.string().email(),
  enrolledAt: z.string(),
  status: z.enum(["active", "paused", "completed", "bounced"]),
  currentStep: z.number().int().min(0),
  stepsCompleted: z.array(z.number()),
  lastSentAt: z.string().optional(),
  lastRepliedAt: z.string().optional(),
});

export type SequenceStep = z.infer<typeof SequenceStepSchema>;
export type Sequence = z.infer<typeof SequenceSchema>;
export type SequenceEnrollment = z.infer<typeof SequenceEnrollmentSchema>;
