import fs from "fs";
import path from "path";
import { getSequence, readEnrollments, updateEnrollment } from "../fs/sequence-store.js";
import { getTemplate } from "../fs/template-store.js";
import { interpolate, buildVariablesFromCustomer } from "./template-engine.js";
import type { SequenceEnrollment } from "../schemas/sequence.js";

/**
 * Add n days to an ISO date string (YYYY-MM-DD) and return YYYY-MM-DD.
 */
export function addDays(isoDateStr: string, n: number): string {
  // Parse the date parts to avoid timezone issues
  const [year, month, day] = isoDateStr.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

export async function processSequenceStep(
  dataDir: string,
  enrollment: SequenceEnrollment,
  today: string // YYYY-MM-DD
): Promise<"sent" | "skipped_replied" | "completed" | "no_step_due"> {
  const sequence = getSequence(dataDir, enrollment.sequenceId);
  if (!sequence) {
    process.stderr.write(`[sequences] Sequence not found: ${enrollment.sequenceId}\n`);
    return "no_step_due";
  }

  // All steps completed
  if (enrollment.currentStep >= sequence.steps.length) {
    await updateEnrollment(dataDir, enrollment.id, { status: "completed" });
    return "completed";
  }

  const step = sequence.steps[enrollment.currentStep]!;

  // Calculate due date: enrolledAt date + step.day
  const enrolledDate = enrollment.enrolledAt.slice(0, 10); // YYYY-MM-DD
  const dueDate = addDays(enrolledDate, step.day);

  // Not yet due
  if (today < dueDate) {
    return "no_step_due";
  }

  // Skip if replied and skipIfReplied is true
  if (step.skipIfReplied && enrollment.lastRepliedAt) {
    await updateEnrollment(dataDir, enrollment.id, {
      currentStep: enrollment.currentStep + 1,
    });
    return "skipped_replied";
  }

  // Load template
  const template = getTemplate(dataDir, step.templateId);
  if (!template) {
    process.stderr.write(`[sequences] Template not found: ${step.templateId}, skipping step\n`);
    await updateEnrollment(dataDir, enrollment.id, {
      currentStep: enrollment.currentStep + 1,
      lastSentAt: new Date().toISOString(),
    });
    return "no_step_due";
  }

  // Build variables
  const vars = await buildVariablesFromCustomer(dataDir, enrollment.slug);
  vars["contactEmail"] = enrollment.contactEmail;

  // Interpolate
  const subject = interpolate(template.subject, vars);
  const body = interpolate(template.body, vars);

  // Try Gmail send if credentials available
  const tokenPath = path.join(dataDir, ".agentic", "gmail-token.json");
  const credPath = path.join(dataDir, ".agentic", "gmail-credentials.json");

  if (fs.existsSync(tokenPath) && fs.existsSync(credPath)) {
    try {
      const { getGmailAuth } = await import("../sync/gmail-auth.js");
      const { sendEmail } = await import("../sync/gmail-sender.js");
      const auth = await getGmailAuth(credPath, tokenPath);
      await sendEmail({
        auth,
        to: enrollment.contactEmail,
        subject,
        body,
        isHtml: false,
      });
      process.stderr.write(`[sequences] Sent step ${enrollment.currentStep} to ${enrollment.contactEmail}\n`);
    } catch (err) {
      process.stderr.write(`[sequences] Send failed: ${(err as Error).message}\n`);
    }
  } else {
    process.stderr.write(`[sequences] Gmail not configured, advancing step for ${enrollment.contactEmail}\n`);
  }

  // Update enrollment
  await updateEnrollment(dataDir, enrollment.id, {
    currentStep: enrollment.currentStep + 1,
    lastSentAt: new Date().toISOString(),
    stepsCompleted: [...enrollment.stepsCompleted, enrollment.currentStep],
  });

  return "sent";
}

export async function runSequenceCycle(
  dataDir: string,
  today: string
): Promise<{ processed: number; sent: number; completed: number; errors: string[] }> {
  const enrollments = readEnrollments(dataDir);
  const active = enrollments.filter((e) => e.status === "active");

  let sent = 0;
  let completed = 0;
  const errors: string[] = [];

  for (const enrollment of active) {
    try {
      const result = await processSequenceStep(dataDir, enrollment, today);
      if (result === "sent") sent++;
      if (result === "completed") completed++;
    } catch (err) {
      const msg = `${enrollment.id}: ${(err as Error).message}`;
      errors.push(msg);
      process.stderr.write(`[sequences] Error processing ${enrollment.id}: ${(err as Error).message}\n`);
    }
  }

  return { processed: active.length, sent, completed, errors };
}
