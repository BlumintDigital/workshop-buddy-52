import { describe, expect, it } from "vitest";
import { formatDate, plural } from "@/lib/format";

describe("plural", () => {
  it("uses the singular for one and adds s otherwise", () => {
    expect(plural(1, "job")).toBe("1 job");
    expect(plural(0, "job")).toBe("0 jobs");
    expect(plural(3, "job")).toBe("3 jobs");
  });

  it("accepts an irregular plural", () => {
    expect(plural(2, "person", "people")).toBe("2 people");
  });
});

describe("formatDate", () => {
  it("shows a dash when there is no date", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });

  it("includes the year", () => {
    expect(formatDate("2026-09-25T10:00:00Z")).toContain("2026");
  });
});
