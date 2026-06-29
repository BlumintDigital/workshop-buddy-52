import { describe, expect, it } from "vitest";
import { getRoleDashboardPath } from "@/hooks/useAuth";

describe("getRoleDashboardPath", () => {
  it("routes each role to its own dashboard", () => {
    expect(getRoleDashboardPath("admin")).toBe("/admin/dashboard");
    expect(getRoleDashboardPath("manager")).toBe("/manager/dashboard");
    expect(getRoleDashboardPath("staff")).toBe("/staff/dashboard");
    expect(getRoleDashboardPath("client")).toBe("/client/dashboard");
  });

  it("falls back to /auth when role is null", () => {
    expect(getRoleDashboardPath(null)).toBe("/auth");
  });
});
