export interface StringGuardOptions {
  maxLen?: number;
  pattern?: RegExp;
  trim?: boolean;
}

export function guardString(
  val: unknown,
  field: string,
  opts: StringGuardOptions = {}
): string {
  if (typeof val !== "string") throw new Error(`${field}: expected string, got ${typeof val}`);
  const trimmed = (opts.trim !== false) ? val.trim() : val;
  if (opts.maxLen !== undefined && trimmed.length > opts.maxLen) {
    throw new Error(`${field}: exceeds max length ${opts.maxLen}`);
  }
  if (opts.pattern && !opts.pattern.test(trimmed)) {
    throw new Error(`${field}: invalid format`);
  }
  return trimmed;
}

export interface NumberGuardOptions {
  min?: number;
  max?: number;
}

export function guardNumber(
  val: unknown,
  field: string,
  opts: NumberGuardOptions = {}
): number {
  if (typeof val !== "number" || !isFinite(val)) {
    throw new Error(`${field}: expected number, got ${typeof val === "number" ? "NaN/Infinity" : typeof val}`);
  }
  if (opts.min !== undefined && val < opts.min) {
    throw new Error(`${field}: must be >= ${opts.min}`);
  }
  if (opts.max !== undefined && val > opts.max) {
    throw new Error(`${field}: must be <= ${opts.max}`);
  }
  return val;
}

export function guardPositiveInt(val: unknown, field: string): number {
  const n = guardNumber(val, field);
  if (!Number.isInteger(n)) throw new Error(`${field}: must be integer`);
  if (n < 1) throw new Error(`${field}: must be >= 1`);
  return n;
}

export function guardIsoDate(val: unknown, field: string): string {
  if (typeof val !== "string" || !val) throw new Error(`${field}: invalid date`);
  const d = new Date(val);
  if (isNaN(d.getTime())) throw new Error(`${field}: invalid date`);
  // Reject clearly invalid month/day combinations (e.g., 2026-13-01)
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
    const [year, month, day] = val.slice(0, 10).split("-").map(Number) as [number, number, number];
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      throw new Error(`${field}: invalid date`);
    }
    // Cross-check with Date parsing
    const reparse = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    if (isNaN(reparse.getTime()) || reparse.getMonth() + 1 !== month) {
      throw new Error(`${field}: invalid date`);
    }
  }
  return val;
}

const DEFAULT_LLM_MAX_BYTES = 512 * 1024; // 512 KB

export function guardLlmResponse(
  response: unknown,
  maxBytes: number = DEFAULT_LLM_MAX_BYTES
): string {
  if (typeof response !== "string") {
    throw new Error("LLM response: expected string");
  }
  const byteLen = Buffer.byteLength(response, "utf-8");
  if (byteLen > maxBytes) {
    throw new Error(`LLM response exceeds ${maxBytes} bytes (got ${byteLen})`);
  }
  return response;
}
