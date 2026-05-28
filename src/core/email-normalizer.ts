export function normalizeEmail(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  // Extract email from "Display Name <email@example.com>" format
  const angleMatch = trimmed.match(/<([^>]+)>/);
  const address = angleMatch ? angleMatch[1]! : trimmed;
  return address.toLowerCase().trim();
}

export function isSameContact(a: string, b: string): boolean {
  return normalizeEmail(a) === normalizeEmail(b);
}

export function normalizeContactId(raw: string): string {
  const email = normalizeEmail(raw);
  // Replace @ with _at_ so it can be used as an object key safely
  return email.replace("@", "_at_");
}
