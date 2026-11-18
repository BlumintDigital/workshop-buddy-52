// Automatic reminders: when one is due, and what it says. Pure, so Vitest can test it
// (src/test/reminders.test.ts) and the automatic-reminders edge function can run it.
import { escapeHtml, wrapEmail } from "./emailLayout.ts";

export const REMINDER_TIME_ZONE = "Europe/London";
const DAY_MS = 86_400_000;

/** 21:00 to 08:00 in the workshop's time zone: nothing is sent. */
export function isQuietHours(now: Date, timeZone = REMINDER_TIME_ZONE): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
  return hour >= 21 || hour < 8;
}

/** The calendar date (YYYY-MM-DD) at that moment in the time zone. */
export function localDate(now: Date, timeZone = REMINDER_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Quote and collection reminders: reminder n goes `everyDays * n` days after the event,
 * up to `maxSteps`. `doneSteps` counts earlier runs whatever their outcome (failed ones too).
 */
export function nextIntervalStep(eventAt: string, doneSteps: number, everyDays: number, maxSteps: number, now: Date): number | null {
  const step = doneSteps + 1;
  if (step > maxSteps || everyDays < 1) return null;
  return now.getTime() >= new Date(eventAt).getTime() + step * everyDays * DAY_MS ? step : null;
}

/** Overdue invoices: one reminder per chosen day after the due date, in order. */
export function nextOverdueStep(dueDate: string, doneSteps: number, days: number[], today: string): number | null {
  const sorted = [...new Set(days)].filter((d) => d >= 1).sort((a, b) => a - b);
  if (doneSteps >= sorted.length) return null;
  const late = Math.round((Date.parse(today) - Date.parse(dueDate)) / DAY_MS);
  return late >= sorted[doneSteps] ? doneSteps + 1 : null;
}

/** "18 Nov 2026" */
export function formatDay(value: string, timeZone = REMINDER_TIME_ZONE): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(date);
}

export interface ReminderEmail { subject: string; html: string }

export function quoteReminderEmail(o: { title: string; sentAt: string; link: string }): ReminderEmail {
  return {
    subject: `Reminder: your quote for ${o.title}`,
    html: wrapEmail({
      preheader: `Your quote for ${o.title} is waiting for a decision.`,
      eyebrow: "Quote reminder",
      headline: "Your quote is waiting for you",
      bodyHtml: `We sent you a quote for <strong>${escapeHtml(o.title)}</strong> on ${escapeHtml(formatDay(o.sentAt))}. When you have a moment, please take a look and let us know whether you would like to go ahead. If you have any questions, just get in touch.`,
      ctaLabel: "Review quote",
      ctaUrl: o.link,
    }),
  };
}

export function overdueInvoiceEmail(o: { number: string; amount: string; dueDate: string; link: string }): ReminderEmail {
  return {
    subject: `Reminder: invoice ${o.number} is overdue`,
    html: wrapEmail({
      preheader: `Invoice ${o.number} for ${o.amount} was due on ${formatDay(o.dueDate)}.`,
      eyebrow: `Invoice ${o.number}`,
      headline: "A friendly reminder about your invoice",
      bodyHtml: `Our records show that invoice <strong>${escapeHtml(o.number)}</strong> for <strong>${escapeHtml(o.amount)}</strong> was due on ${escapeHtml(formatDay(o.dueDate))}. If you have already paid, thank you, and please ignore this email. If not, you can view and pay it using the link below.`,
      ctaLabel: "View invoice",
      ctaUrl: o.link,
    }),
  };
}

export function collectionReminderEmail(o: { label: string; link: string }): ReminderEmail {
  return {
    subject: `Reminder: ${o.label} is ready for you`,
    html: wrapEmail({
      preheader: `${o.label} is ready. Let us know how you would like to get it.`,
      eyebrow: "Ready for you",
      headline: "Your item is still waiting for you",
      bodyHtml: `<strong>${escapeHtml(o.label)}</strong> is ready. Please let us know whether you would like to collect it or have it delivered, and we will arrange the rest.`,
      ctaLabel: "Choose collection or delivery",
      ctaUrl: o.link,
    }),
  };
}
