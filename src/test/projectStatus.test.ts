import { describe, expect, it } from "vitest";
import { manualStatusOptions } from "@/lib/projects";

describe("manualStatusOptions", () => {
  it("offers only earlier stages and cancelling", () => {
    expect(manualStatusOptions("in_progress")).toEqual(["received", "evaluation", "quote", "pending", "in_progress", "cancelled"]);
  });
  it("never offers a forward jump", () => {
    const fromApproved = manualStatusOptions("pending");
    for (const ahead of ["in_progress", "review", "completed", "shipped"]) expect(fromApproved).not.toContain(ahead);
  });
  it("keeps shipped final and lets a cancelled project reopen at Received", () => {
    expect(manualStatusOptions("shipped")).toEqual(["shipped"]);
    expect(manualStatusOptions("cancelled")).toEqual(["cancelled", "received"]);
  });
});
