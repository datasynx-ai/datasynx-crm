import fs from "fs";
import { withFileQueue } from "../fs/write-queue.js";
import { writeFileAtomic } from "../fs/atomic-write.js";

export async function withJsonFile<T>(
  filePath: string,
  updater: (current: T | null) => T | Promise<T>
): Promise<T> {
  return withFileQueue(filePath, async () => {
    // Read current state
    let current: T | null = null;
    if (fs.existsSync(filePath)) {
      try {
        current = JSON.parse(fs.readFileSync(filePath, "utf-8") as string) as T;
      } catch {
        current = null;
      }
    }

    // Apply updater — may throw, in which case we do NOT write
    const next = await updater(current);

    // Serialized by the queue lock AND crash-safe via temp-file + rename.
    writeFileAtomic(filePath, JSON.stringify(next, null, 2));

    return next;
  });
}
