/**
 * Escape a string so it can be embedded safely as a literal inside a `RegExp`.
 * Prevents both broken patterns and ReDoS/injection when interpolating
 * field names, section headers, or other dynamic values into a regex.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
