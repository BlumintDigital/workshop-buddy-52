import { describe, expect, it } from "vitest";
import { isReservedTaskTitle } from "@/lib/taskTitles";

describe("isReservedTaskTitle", () => {
  it.each(["Quality check", "QC", "Final inspection", "Shipping", "Ship", "Collection", "Hand over", "Delivery"])("refuses %s", (t) => {
    expect(isReservedTaskTitle(t)).toBe(true);
  });

  it("ignores case, spacing and punctuation", () => {
    expect(isReservedTaskTitle("  quality   CHECK ")).toBe(true);
    expect(isReservedTaskTitle("Q.C.")).toBe(true);
    expect(isReservedTaskTitle("Hand-over")).toBe(true);
    expect(isReservedTaskTitle("Handover")).toBe(true);
    expect(isReservedTaskTitle("Shipping.")).toBe(true);
  });

  it("allows real work that only mentions a stage word", () => {
    expect(isReservedTaskTitle("Inspect brakes")).toBe(false);
    expect(isReservedTaskTitle("Check shipping damage")).toBe(false);
    expect(isReservedTaskTitle("Collection of parts from supplier")).toBe(false);
    expect(isReservedTaskTitle("Rework: Quality check")).toBe(false);
    expect(isReservedTaskTitle("Weld bracket")).toBe(false);
    expect(isReservedTaskTitle("")).toBe(false);
  });
});
