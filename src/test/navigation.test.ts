import { describe, expect, it } from "vitest";
import { NAV_GROUPS, isItemActive, tabBarItems } from "@/lib/navigation";

const allOn = { appointments: true, client_portal: true, reports: true, goals: true };

describe("navigation", () => {
  it("gives every role at most four tab-bar destinations that exist in its menu", () => {
    for (const role of ["admin", "manager", "staff", "client"] as const) {
      const tabs = tabBarItems(role, allOn);
      expect(tabs.length).toBeGreaterThan(0);
      expect(tabs.length).toBeLessThanOrEqual(4);
      const menuUrls = NAV_GROUPS[role].flatMap((g) => g.items.map((i) => i.url));
      tabs.forEach((t) => expect(menuUrls).toContain(t.url));
    }
  });

  it("drops tabs whose feature is switched off", () => {
    const tabs = tabBarItems("client", { ...allOn, appointments: false });
    expect(tabs.map((t) => t.url)).not.toContain("/client/appointments");
  });

  it("highlights a section on its detail pages but keeps home screens exact", () => {
    const users = NAV_GROUPS.admin.flatMap((g) => g.items).find((i) => i.url === "/admin/users")!;
    const today = NAV_GROUPS.admin[0].items[0];
    expect(isItemActive(users, "/admin/users/123")).toBe(true);
    expect(isItemActive(users, "/admin/usersettings")).toBe(false);
    expect(isItemActive(today, "/admin/dashboard")).toBe(true);
    expect(isItemActive(today, "/admin/dashboard/extra")).toBe(false);
  });
});
