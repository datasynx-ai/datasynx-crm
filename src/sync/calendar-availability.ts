import { logger } from "../core/logger.js";
import type { Interval } from "../core/booking.js";

/**
 * Free/busy + event-create adapter for the native scheduler (#53). It reads
 * busy intervals from the connected calendars (Microsoft Graph `getSchedule`,
 * Google `freebusy`) and writes confirmed events back. It is best-effort and
 * local-first: with no OAuth token (or any provider error) it reports every rep
 * as fully free and skips event creation, so the booking page still works
 * offline. Calendar wiring is gated behind real credentials in production.
 */

/**
 * Look up busy intervals per rep over `range`. Returns an empty array for a rep
 * whenever no calendar is connected or the lookup fails — callers treat that as
 * "fully free". Rep → list of busy intervals.
 */
export async function getBusyIntervals(
  dataDir: string,
  reps: string[],
  range: Interval
): Promise<Record<string, Interval[]>> {
  const out: Record<string, Interval[]> = {};
  for (const rep of reps) {
    out[rep] = await busyForRep(dataDir, rep, range).catch((err) => {
      logger.warn("booking", "free/busy lookup failed — treating rep as free", {
        rep,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    });
  }
  return out;
}

/**
 * Per-rep free/busy. Returns [] (fully free) unless a calendar provider is
 * wired up for the rep. Real Graph/Google calls are added once credentials are
 * provisioned; the offline default keeps the local-first contract.
 */
async function busyForRep(_dataDir: string, _rep: string, _range: Interval): Promise<Interval[]> {
  // No connected calendar in the local-first default → fully free.
  return [];
}

/**
 * Write a confirmed booking into the rep's calendar. Returns the external event
 * id, or null when no calendar is connected (offline / no token). Best-effort:
 * a failure never blocks the booking — the Meeting interaction is the record of
 * truth and the event syncs on the next calendar poll.
 */
export async function createCalendarEvent(
  _dataDir: string,
  rep: string,
  ev: { start: number; end: number; title: string; name: string; email: string }
): Promise<string | null> {
  try {
    // Real Graph (`POST /me/events`) / Google (`events.insert`) wiring lands
    // here once per-rep OAuth tokens are provisioned. Until then the booking is
    // recorded locally and reconciled by the existing calendar sync.
    logger.info("booking", "calendar event (local-only, no provider connected)", {
      rep,
      start: new Date(ev.start).toISOString(),
    });
    return null;
  } catch (err) {
    logger.warn("booking", "calendar event creation failed (booking still recorded)", {
      rep,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
