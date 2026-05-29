import fs from "fs";
import path from "path";
import { z } from "zod";

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
  const p = contactsPath(dataDir, slug);
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8") as string) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      const r = CustomerContactSchema.safeParse(item);
      return r.success ? [r.data] : [];
    });
  } catch { return []; }
}

export function upsertContact(dataDir: string, slug: string, contact: CustomerContact): void {
  const contacts = listContacts(dataDir, slug);
  const idx = contacts.findIndex(
    (c) => c.email.toLowerCase() === contact.email.toLowerCase()
  );
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
  const dir = path.dirname(contactsPath(dataDir, slug));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(contactsPath(dataDir, slug), JSON.stringify(contacts, null, 2), "utf-8");
}

export function getPrimaryContact(dataDir: string, slug: string): CustomerContact | null {
  const contacts = listContacts(dataDir, slug);
  return contacts.find((c) => c.isPrimary) ?? contacts[0] ?? null;
}
