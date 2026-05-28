import fs from "fs";
import path from "path";
import { withFileQueue } from "../fs/write-queue.js";

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

    // Write atomically (within the queue lock)
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(next, null, 2), "utf-8");

    return next;
  });
}
