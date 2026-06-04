import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";

/**
 * Atomically write `content` to `filePath`, creating parent directories as
 * needed. The payload is written to a sibling temp file and then renamed over
 * the target. rename(2) is atomic within a filesystem, so a crash or a
 * concurrent reader can never observe a half-written (truncated/corrupt) file —
 * only the complete old or complete new content. Used for every durable file
 * the product owns (customer Markdown, JSON config/state, audit logs).
 */
export function writeFileAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(tmp, content, "utf-8");
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // Best-effort cleanup of the temp file if the write/rename failed.
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore cleanup failure */
    }
    throw err;
  }
}
