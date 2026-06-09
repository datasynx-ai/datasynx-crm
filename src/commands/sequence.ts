import { Command } from "commander";
import { success, error, info, bold } from "../ui/colors.js";
import {
  listSequences,
  getSequence,
  writeSequence,
  readEnrollments,
  writeEnrollment,
} from "../fs/sequence-store.js";
import { runSequenceCycle } from "../core/sequence-engine.js";
import { getTemplate, writeTemplate } from "../fs/template-store.js";
import type { Sequence } from "../schemas/sequence.js";
import type { EmailTemplate } from "../schemas/email-template.js";

export const sequenceCommand = new Command("sequence").description("Manage email sequences");

sequenceCommand
  .command("list")
  .description("List all sequences")
  .action(() => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const sequences = listSequences(dataDir);
    const enrollments = readEnrollments(dataDir);

    if (sequences.length === 0) {
      console.log(info("No sequences found."));
      return;
    }

    for (const seq of sequences) {
      const count = enrollments.filter((e) => e.sequenceId === seq.id).length;
      console.log(`  ${bold(seq.id)}  "${seq.name}"  ${seq.steps.length} steps  ${count} enrolled`);
    }
  });

sequenceCommand
  .command("create <id>")
  .description("Create a new sequence skeleton")
  .option("--name <name>", "Sequence display name")
  .action((id: string, opts: { name?: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

    const existing = getSequence(dataDir, id);
    if (existing) {
      console.error(error(`Sequence '${id}' already exists`));
      process.exit(1);
    }

    const seq: Sequence = {
      id,
      name: opts.name ?? id,
      steps: [
        { day: 0, templateId: "intro", skipIfReplied: true },
        { day: 3, templateId: "followup-1", skipIfReplied: true },
        { day: 7, templateId: "followup-2", skipIfReplied: true },
      ],
      createdAt: new Date().toISOString(),
    };

    writeSequence(dataDir, seq);
    console.log(success(`✓ Sequence '${id}' created with ${seq.steps.length} steps`));

    // Scaffold any referenced template that doesn't exist yet, so the fresh
    // sequence is enroll-able out of the box (enroll_in_sequence validates that
    // step 0's template exists, and the engine skips steps with missing ones).
    const scaffolded: string[] = [];
    for (const step of seq.steps) {
      if (getTemplate(dataDir, step.templateId)) continue;
      const tmpl: EmailTemplate = {
        id: step.templateId,
        subject: `[${seq.name}] ${step.templateId}`,
        category: "sequence",
        variables: [],
        language: "de",
        createdAt: new Date().toISOString(),
        body: `Hi {{firstName}},\n\n[your message for step "${step.templateId}" here]\n\nBest regards,\n{{senderName}}`,
      };
      writeTemplate(dataDir, tmpl);
      scaffolded.push(step.templateId);
    }
    if (scaffolded.length > 0) {
      console.log(
        success(`✓ Scaffolded ${scaffolded.length} starter template(s): ${scaffolded.join(", ")}`)
      );
    }
    console.log(info(`Edit .agentic/sequences/${id}.yaml to customize steps and templates`));
  });

sequenceCommand
  .command("enroll <slug>")
  .description("Enroll a customer contact in a sequence")
  .requiredOption("--email <email>", "Contact email address")
  .requiredOption("--sequence <id>", "Sequence ID")
  .action(async (slug: string, opts: { email: string; sequence: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

    const seq = getSequence(dataDir, opts.sequence);
    if (!seq) {
      console.error(error(`Sequence '${opts.sequence}' not found`));
      process.exit(1);
    }

    const enrollmentId = `enroll_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const now = new Date().toISOString();

    await writeEnrollment(dataDir, {
      id: enrollmentId,
      sequenceId: opts.sequence,
      slug,
      contactEmail: opts.email,
      enrolledAt: now,
      status: "active",
      currentStep: 0,
      stepsCompleted: [],
    });

    console.log(success(`✓ Enrolled ${opts.email} in sequence '${seq.name}'`));
    console.log(info(`Enrollment ID: ${enrollmentId}`));
  });

sequenceCommand
  .command("status")
  .description("Show enrollment status")
  .option("--slug <slug>", "Filter by customer slug")
  .action((opts: { slug?: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    let enrollments = readEnrollments(dataDir);

    if (opts.slug) {
      enrollments = enrollments.filter((e) => e.slug === opts.slug);
    }

    if (enrollments.length === 0) {
      console.log(info("No enrollments found."));
      return;
    }

    for (const e of enrollments) {
      const stepInfo = `step ${e.currentStep}`;
      const lastSent = e.lastSentAt ? ` last sent ${e.lastSentAt.slice(0, 10)}` : "";
      console.log(
        `  ${bold(e.id)}  ${e.slug} <${e.contactEmail}>  seq:${e.sequenceId}  [${e.status}]  ${stepInfo}${lastSent}`
      );
    }
  });

sequenceCommand
  .command("run")
  .description("Run the sequence cycle (send due emails)")
  .option("--dry-run", "Show what would be sent without sending")
  .action(async (opts: { dryRun?: boolean }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const today = new Date().toISOString().slice(0, 10);

    if (opts.dryRun) {
      const enrollments = readEnrollments(dataDir).filter((e) => e.status === "active");
      console.log(info(`Dry run — ${enrollments.length} active enrollments for ${today}`));
      for (const e of enrollments) {
        console.log(`  Would process: ${e.id} (${e.contactEmail}, step ${e.currentStep})`);
      }
      return;
    }

    const result = await runSequenceCycle(dataDir, today);
    console.log(
      success(
        `✓ Cycle complete: ${result.sent} sent, ${result.completed} completed, ${result.errors.length} errors`
      )
    );
    if (result.errors.length > 0) {
      for (const e of result.errors) {
        console.error(error(`  Error: ${e}`));
      }
    }
  });
