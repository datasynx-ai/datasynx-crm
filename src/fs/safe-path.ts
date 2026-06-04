/**
 * Filesystem path-segment safety. A segment (customer slug, custom-object name,
 * KB article id/category, …) is safe iff it cannot escape its parent directory:
 * no path separators, no `..`, no NUL, not "." or empty, and bounded in length.
 * Enforced wherever an untrusted value (from an MCP tool, API, or import) is used
 * to build a file path, to prevent path-traversal (arbitrary read/write).
 */
export function isSafePathSegment(segment: unknown): segment is string {
  return (
    typeof segment === "string" &&
    segment.length > 0 &&
    segment.length <= 128 &&
    segment !== "." &&
    !segment.includes("/") &&
    !segment.includes("\\") &&
    !segment.includes("\0") &&
    !segment.includes("..")
  );
}

export function assertSafePathSegment(segment: string, kind = "path segment"): void {
  if (!isSafePathSegment(segment)) {
    throw new Error(`Invalid ${kind}: ${JSON.stringify(segment)}`);
  }
}
