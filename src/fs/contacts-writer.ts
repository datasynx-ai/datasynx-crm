import path from "path";
import { z } from "zod";
import { readJsonFile, writeJsonFile } from "./json-store.js";
import { assertSafeSlug } from "./customer-dir.js";

export const CustomerContactSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  title: z.string().optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  isPrimary: z.boolean().default(false),
  hubspotId: z.string().optional(),
  hubspotOwnerId: z.string().optional(),
  createdAt: z.string().optional(),
});

export type CustomerContact = z.infer<typeof CustomerContactSchema>;

function contactsPath(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug, "contacts.json");
}

export function listContacts(dataDir: string, slug: string): CustomerContact[] {
  const raw = readJsonFile<unknown>(contactsPath(dataDir, slug), []);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const r = CustomerContactSchema.safeParse(item);
    return r.success ? [r.data] : [];
  });
}

export function upsertContact(dataDir: string, slug: string, contact: CustomerContact): void {
  assertSafeSlug(slug);
  const contacts = listContacts(dataDir, slug);
  const idx = contacts.findIndex((c) => c.email.toLowerCase() === contact.email.toLowerCase());
  if (idx >= 0) {
    contacts[idx] = { ...contacts[idx], ...contact };
  } else {
    contacts.push(contact);
  }
  // Ensure only one primary
  if (contact.isPrimary) {
    for (const c of contacts) {
      if (c.email.toLowerCase() !== contact.email.toLowerCase()) {
        c.isPrimary = false;
      }
    }
  }
  writeJsonFile(contactsPath(dataDir, slug), contacts);
}

export function getPrimaryContact(dataDir: string, slug: string): CustomerContact | null {
  const contacts = listContacts(dataDir, slug);
  return contacts.find((c) => c.isPrimary) ?? contacts[0] ?? null;
}
