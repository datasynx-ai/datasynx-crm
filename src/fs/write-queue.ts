const queues = new Map<string, Promise<void>>();

export function withFileQueue<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const current = queues.get(filePath) ?? Promise.resolve();
  let resolve!: () => void;
  const barrier = new Promise<void>((r) => { resolve = r; });
  queues.set(filePath, current.then(() => barrier));
  return current.then(async () => {
    try {
      return await fn();
    } finally {
      resolve();
    }
  });
}
