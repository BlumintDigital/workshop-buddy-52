export interface ICalEvent {
  title: string;
  date: string;       // "YYYY-MM-DD"
  time?: string;      // "HH:MM"
  durationMinutes?: number;
  description?: string;
  location?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDTStart(date: string, time?: string): string {
  const d = date.replace(/-/g, "");
  if (!time) return `${d}`;
  const t = time.replace(":", "") + "00";
  return `${d}T${t}`;
}

function formatDTEnd(date: string, time?: string, durationMinutes = 60): string {
  if (!time) {
    // All-day: end is the next day
    const [y, m, d] = date.split("-").map(Number);
    const next = new Date(y, m - 1, d + 1);
    return `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const end = new Date(year, month - 1, day, hour, minute + durationMinutes);
  return `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}T${pad(end.getHours())}${pad(end.getMinutes())}00`;
}

function escapeICS(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function nowStamp(): string {
  const n = new Date();
  return `${n.getFullYear()}${pad(n.getMonth() + 1)}${pad(n.getDate())}T${pad(n.getHours())}${pad(n.getMinutes())}${pad(n.getSeconds())}Z`;
}

export function generateICS(events: ICalEvent[], calendarName = "Workshop Manager"): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Workshop Manager//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${calendarName}`,
  ];

  for (const ev of events) {
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@workshop`;
    const isAllDay = !ev.time;
    const dtStart = formatDTStart(ev.date, ev.time);
    const dtEnd = formatDTEnd(ev.date, ev.time, ev.durationMinutes);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${nowStamp()}`);

    if (isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
    } else {
      lines.push(`DTSTART:${dtStart}`);
      lines.push(`DTEND:${dtEnd}`);
    }

    lines.push(`SUMMARY:${escapeICS(ev.title)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeICS(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeICS(ev.location)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICS(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
