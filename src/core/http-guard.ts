/**
 * Shared guards for public (unauthenticated) HTTP endpoints (#60/#61): a
 * sliding-window per-key rate limiter and client-IP extraction. Used by the
 * `/forms`, `/chat` and `/webhooks/whatsapp` routes — each surface creates its
 * own limiter instance with limits matching its traffic shape.
 */

export interface RateLimiterConfig {
  windowMs: number;
  max: number;
}

export interface SlidingWindowLimiter {
  /** Records a hit for `key` and reports whether the key is over the limit. */
  limited(key: string, now?: number): boolean;
  /** Clears all state (tests). */
  reset(): void;
}

export function createRateLimiter(config: RateLimiterConfig): SlidingWindowLimiter {
  const hits = new Map<string, number[]>();
  return {
    limited(key: string, now: number = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < config.windowMs);
      if (recent.length >= config.max) {
        hits.set(key, recent);
        return true;
      }
      recent.push(now);
      hits.set(key, recent);
      return false;
    },
    reset(): void {
      hits.clear();
    },
  };
}

export interface IpSource {
  headers: Record<string, unknown>;
  socket?: { remoteAddress?: string | null | undefined };
}

/** First `x-forwarded-for` hop → socket address → "unknown". */
export function clientIp(req: IpSource): string {
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? (fwd[0] as string) : typeof fwd === "string" ? fwd : "";
  const first = raw.split(",")[0]?.trim();
  return first || req.socket?.remoteAddress || "unknown";
}
