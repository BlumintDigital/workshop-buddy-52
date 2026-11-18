import { describe, expect, it } from "vitest";
import { elapsedMs, formatElapsed, formatMinutes, isForgotten, minutesToLog } from "@/lib/timer";

const start = "2026-11-18T09:00:00.000Z";
const at = (iso: string) => Date.parse(iso);

describe("task timer", () => {
  it("measures elapsed time from the server's start", () => {
    expect(elapsedMs(start, at("2026-11-18T09:04:07.000Z"))).toBe(247_000);
  });

  it("never goes negative when the phone's clock is behind", () => {
    expect(elapsedMs(start, at("2026-11-18T08:59:00.000Z"))).toBe(0);
  });

  it("rounds logged time to the nearest minute", () => {
    expect(minutesToLog(start, at("2026-11-18T09:00:29.000Z"))).toBe(0);
    expect(minutesToLog(start, at("2026-11-18T09:00:30.000Z"))).toBe(1);
    expect(minutesToLog(start, at("2026-11-18T09:44:40.000Z"))).toBe(45);
  });

  it("caps a forgotten timer at 24 hours", () => {
    expect(minutesToLog(start, at("2026-11-20T09:00:00.000Z"))).toBe(24 * 60);
  });

  it("flags a timer running more than 10 hours", () => {
    expect(isForgotten(start, at("2026-11-18T19:00:00.000Z"))).toBe(false);
    expect(isForgotten(start, at("2026-11-18T19:00:01.000Z"))).toBe(true);
    expect(isForgotten(null, Date.now())).toBe(false);
  });

  it("logs nothing for a stop with no start", () => {
    expect(elapsedMs(null, Date.now())).toBe(0);
    expect(minutesToLog(undefined, Date.now())).toBe(0);
    expect(minutesToLog("not a date", Date.now())).toBe(0);
  });

  it("formats the running time and logged time", () => {
    expect(formatElapsed(247_000)).toBe("4:07");
    expect(formatElapsed(3_847_000)).toBe("1:04:07");
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(65)).toBe("1 h 5 min");
    expect(formatMinutes(120)).toBe("2 h");
  });
});
