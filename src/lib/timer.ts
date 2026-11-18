/**
 * Timer maths for My day. The server logs the time (public._stop_task_timer);
 * these mirror its rules so the screen shows what will be logged.
 */

/** The most one time entry can hold. */
const MAX_MINUTES = 24 * 60;

/** Milliseconds since the timer started; 0 with no start, a bad date or a clock behind the server. */
export function elapsedMs(startedAt: string | null | undefined, now: number): number {
  if (!startedAt) return 0;
  const start = Date.parse(startedAt);
  return Number.isFinite(start) ? Math.max(0, now - start) : 0;
}

/** Whole minutes a stop would log: rounded to the nearest minute, capped at 24 hours. */
export function minutesToLog(startedAt: string | null | undefined, stoppedAt: number): number {
  return Math.min(Math.round(elapsedMs(startedAt, stoppedAt) / 60_000), MAX_MINUTES);
}

/** Running time for display: "4:07" under an hour, "1:04:07" after. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Logged time in words: "45 min", "1 h 5 min", "2 h". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
