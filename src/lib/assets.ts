// Service reminders: when one is due, by date and/or meter reading. Kept pure so the list, the
// detail page, the client portal and the tests all agree.

import type { MeterUnit } from "@/lib/industry";

export interface ReminderLike {
  title: string;
  active: boolean;
  due_date: string | null;
  due_meter: number | null;
  interval_meter: number | null;
}

export type ReminderState = "overdue" | "due_soon" | "ok" | "inactive";

/** Days ahead that count as "due soon"; matches the daily notice in send_asset_reminders(). */
export const DUE_SOON_DAYS = 14;

const DAY = 86_400_000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function reminderState(r: ReminderLike, meterReading: number | null, today = new Date()): ReminderState {
  if (!r.active) return "inactive";
  let state: ReminderState = "ok";
  if (r.due_date) {
    const days = Math.round((startOfDay(new Date(`${r.due_date}T00:00:00`)) - startOfDay(today)) / DAY);
    if (days < 0) return "overdue";
    if (days <= DUE_SOON_DAYS) state = "due_soon";
  }
  if (r.due_meter != null && meterReading != null) {
    if (meterReading >= r.due_meter) return "overdue";
    const margin = Math.max((r.interval_meter ?? r.due_meter) * 0.1, 1);
    if (meterReading >= r.due_meter - margin) state = "due_soon";
  }
  return state;
}

export const REMINDER_STATE_LABEL: Record<ReminderState, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  ok: "Scheduled",
  inactive: "Finished",
};

export const REMINDER_STATE_TONE: Record<ReminderState, "danger" | "warning" | "neutral" | "success"> = {
  overdue: "danger",
  due_soon: "warning",
  ok: "neutral",
  inactive: "success",
};

/** The worst state among an asset's reminders, for list badges. */
export function worstState(states: ReminderState[]): ReminderState | null {
  for (const s of ["overdue", "due_soon", "ok"] as ReminderState[]) if (states.includes(s)) return s;
  return null;
}

export function formatMeter(value: number | null | undefined, unit: MeterUnit | string | null | undefined): string | null {
  if (value == null) return null;
  return `${Math.round(value).toLocaleString()} ${unit ?? ""}`.trim();
}

/** "Due 14 Mar 2027 or at 60,000 miles", whichever is set. */
export function describeDue(r: Pick<ReminderLike, "due_date" | "due_meter">, unit: MeterUnit | string | null | undefined): string {
  const parts: string[] = [];
  if (r.due_date) parts.push(new Date(`${r.due_date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }));
  if (r.due_meter != null) parts.push(`at ${formatMeter(r.due_meter, unit)}`);
  return parts.length ? `Due ${parts.join(" or ")}` : "No due date";
}

/** "Every 12 months or 10,000 miles". */
export function describeInterval(months: number | null, meter: number | null, unit: MeterUnit | string | null | undefined): string | null {
  const parts: string[] = [];
  if (months) parts.push(months === 1 ? "every month" : `every ${months} months`);
  if (meter) parts.push(`${parts.length ? "" : "every "}${formatMeter(meter, unit)}`);
  if (!parts.length) return null;
  const s = parts.join(" or ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** First due date for a new reminder: today plus the interval. */
export function firstDueDate(months: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth() + months, from.getDate());
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
