import type { EmailTemplate } from "../schemas/email-template.js";
import type { Sequence } from "../schemas/sequence.js";

/**
 * The opinionated starter set seeded on `dxcrm init` so a fresh vault can draft
 * emails and enroll contacts immediately, with schema-correct examples to clone.
 *
 * All content is English (Language Policy) and generic across verticals. Every item
 * carries `starter: true` and a `starter-` id prefix so it is unambiguously an
 * example that can be edited or deleted freely.
 *
 * Bump CURRENT_STARTER_SEED_VERSION when the set changes: new ids are seeded on the
 * next init, while ids a user has deleted are never resurrected (see starter-seed.ts).
 */
export const CURRENT_STARTER_SEED_VERSION = 1;

/** A starter template definition; createdAt/updatedAt are stamped at seed time. */
export type StarterTemplate = Omit<EmailTemplate, "createdAt" | "updatedAt">;
/** A starter sequence definition; createdAt is stamped at seed time. */
export type StarterSequence = Omit<Sequence, "createdAt">;

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "starter-cold-intro",
    category: "outreach",
    language: "en",
    starter: true,
    subject: "Quick question about {{company}}",
    variables: ["company", "firstName", "senderName"],
    body: [
      "Hi {{firstName}},",
      "",
      "I'm {{senderName}}. I work with teams like {{company}} on [the problem you solve].",
      "",
      "Worth a short call next week to see if it's relevant for you?",
      "",
      "Best,",
      "{{senderName}}",
    ].join("\n"),
  },
  {
    id: "starter-followup-1",
    category: "outreach",
    language: "en",
    starter: true,
    subject: "Following up — {{company}}",
    variables: ["company", "firstName", "senderName"],
    body: [
      "Hi {{firstName}},",
      "",
      "Circling back on my note below — happy to share a couple of examples relevant to {{company}}.",
      "",
      "Open to a quick 15-minute call?",
      "",
      "Best,",
      "{{senderName}}",
    ].join("\n"),
  },
  {
    id: "starter-breakup",
    category: "outreach",
    language: "en",
    starter: true,
    subject: "Should I close the loop?",
    variables: ["company", "firstName", "senderName"],
    body: [
      "Hi {{firstName}},",
      "",
      "I haven't heard back, so I'll assume the timing isn't right for {{company}} just now.",
      "",
      "If that changes, reply here and I'll pick it straight back up.",
      "",
      "Best,",
      "{{senderName}}",
    ].join("\n"),
  },
  {
    id: "starter-post-demo-recap",
    category: "followup",
    language: "en",
    starter: true,
    subject: "Recap & next steps after our call",
    variables: ["firstName", "company", "senderName"],
    body: [
      "Hi {{firstName}},",
      "",
      "Thanks for your time today. Quick recap for {{company}}:",
      "",
      "- [Key point 1]",
      "- [Key point 2]",
      "- [Agreed next step]",
      "",
      "I'll follow up on the above — anything I missed?",
      "",
      "Best,",
      "{{senderName}}",
    ].join("\n"),
  },
  {
    id: "starter-ticket-acknowledgement",
    category: "support",
    language: "en",
    starter: true,
    subject: "We've received your request",
    variables: ["firstName", "senderName"],
    body: [
      "Hi {{firstName}},",
      "",
      "Thanks for reaching out — we've logged your request and are looking into it now.",
      "",
      "We'll be back to you shortly with an update.",
      "",
      "Best,",
      "{{senderName}}",
    ].join("\n"),
  },
];

export const STARTER_SEQUENCES: StarterSequence[] = [
  {
    id: "starter-cold-outreach",
    name: "Starter — Cold Outreach (example)",
    starter: true,
    steps: [
      { day: 0, templateId: "starter-cold-intro", skipIfReplied: true },
      { day: 3, templateId: "starter-followup-1", skipIfReplied: true },
      { day: 7, templateId: "starter-breakup", skipIfReplied: true },
    ],
  },
];
