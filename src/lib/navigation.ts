// Navigation structure shared by the sidebar (desktop) and the bottom tab bar (phones).

import {
  Activity,
  AlertCircle,
  BarChart3,
  BookOpen,
  Briefcase,
  Calendar,
  CalendarDays,
  Columns3,
  FileText,
  Home,
  Inbox,
  KeyRound,
  MessageSquare,
  Package,
  Settings,
  ShieldCheck,
  Target,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/hooks/useAuth";
import type { FeatureKey } from "@/hooks/useFeatureFlags";
import type { NavCountKey } from "@/hooks/useNavCounts";

export type NavItem = {
  title: string;
  /** Shorter label for the tab bar. */
  short?: string;
  url: string;
  icon: LucideIcon;
  features?: FeatureKey[];
  /** Live count shown as a badge. */
  count?: NavCountKey;
  /** Match only the exact path (for home screens), not child routes. */
  exact?: boolean;
};

export type NavGroup = {
  /** Omitted for the primary list, which needs no heading. */
  label?: string;
  /** Collapsed by default unless the current page is inside it. */
  collapsible?: boolean;
  items: NavItem[];
};

const HELP: NavGroup = {
  label: "Help",
  items: [
    { title: "User Guide", url: "/help", icon: BookOpen },
    { title: "Report Issue", url: "/report-issue", icon: AlertCircle },
  ],
};

const TODAY_ADMIN: NavItem = { title: "Today", url: "/admin/dashboard", icon: Home, exact: true };
const TODAY_MANAGER: NavItem = { title: "Today", url: "/manager/dashboard", icon: Home, exact: true };

export const NAV_GROUPS: Record<AppRole, NavGroup[]> = {
  admin: [
    {
      items: [
        TODAY_ADMIN,
        { title: "Projects", url: "/admin/projects", icon: Briefcase, count: "reviewJobs" },
        { title: "Requests", url: "/admin/requests", icon: Inbox, count: "requests" },
        { title: "Appointments", short: "Bookings", url: "/admin/appointments", icon: Calendar, features: ["appointments"] },
        { title: "Calendar", url: "/admin/calendar", icon: CalendarDays, features: ["appointments"] },
        { title: "Invoices", url: "/admin/invoices", icon: FileText, count: "overdueInvoices" },
        { title: "Inventory", short: "Stock", url: "/admin/inventory", icon: Package, count: "lowStock" },
        { title: "Reports", url: "/admin/reports", icon: BarChart3, features: ["reports"] },
        { title: "Goals", url: "/goals", icon: Target, features: ["goals"] },
      ],
    },
    {
      label: "People",
      items: [
        { title: "Users", url: "/admin/users", icon: Users },
        { title: "Clients", url: "/admin/clients", icon: UserCheck, features: ["client_portal"] },
      ],
    },
    {
      label: "Admin",
      collapsible: true,
      items: [
        { title: "Settings", url: "/admin/settings", icon: Settings },
        { title: "Activity Logs", url: "/admin/activity-logs", icon: Activity },
        { title: "Access Review", url: "/admin/access-review", icon: ShieldCheck },
        { title: "Signup Codes", url: "/admin/signup-codes", icon: KeyRound },
        { title: "Issue Reports", url: "/admin/feedback", icon: MessageSquare },
      ],
    },
    HELP,
  ],
  manager: [
    {
      items: [
        TODAY_MANAGER,
        { title: "Projects", url: "/manager/projects", icon: Briefcase, count: "reviewJobs" },
        { title: "Requests", url: "/manager/requests", icon: Inbox, count: "requests" },
        { title: "Appointments", short: "Bookings", url: "/manager/appointments", icon: Calendar, features: ["appointments"] },
        { title: "Calendar", url: "/manager/calendar", icon: CalendarDays, features: ["appointments"] },
        { title: "Invoices", url: "/manager/invoices", icon: FileText, count: "overdueInvoices" },
        { title: "Inventory", short: "Stock", url: "/manager/inventory", icon: Package, count: "lowStock" },
        { title: "Goals", url: "/goals", icon: Target, features: ["goals"] },
      ],
    },
    { label: "People", items: [{ title: "Staff", url: "/manager/staff", icon: Users }] },
    { label: "Admin", collapsible: true, items: [{ title: "Signup Codes", url: "/admin/signup-codes", icon: KeyRound }] },
    HELP,
  ],
  staff: [
    {
      items: [
        { title: "My day", url: "/staff/dashboard", icon: Home, exact: true },
        { title: "My projects", short: "Projects", url: "/staff/projects", icon: Briefcase, count: "myOpenJobs" },
        { title: "Board", url: "/staff/kanban", icon: Columns3 },
        { title: "Schedule", url: "/staff/schedule", icon: Calendar, features: ["appointments"] },
        { title: "Inventory", short: "Stock", url: "/staff/inventory", icon: Package },
        { title: "Goals", url: "/goals", icon: Target, features: ["goals"] },
      ],
    },
    HELP,
  ],
  client: [
    {
      items: [
        { title: "Your orders", short: "Orders", url: "/client/dashboard", icon: Home, exact: true, features: ["client_portal"] },
        { title: "Requests", url: "/client/requests", icon: Inbox, count: "quotesToDecide", features: ["client_portal"] },
        { title: "Projects", url: "/client/projects", icon: Briefcase, features: ["client_portal"] },
        { title: "Appointments", short: "Bookings", url: "/client/appointments", icon: Calendar, features: ["client_portal", "appointments"] },
        { title: "Invoices", url: "/client/invoices", icon: FileText, features: ["client_portal"] },
      ],
    },
    HELP,
  ],
};

/** Up to four destinations for the phone tab bar; "More" (the full menu) is always added after them. */
export const TAB_BAR_URLS: Record<AppRole, string[]> = {
  admin: ["/admin/dashboard", "/admin/projects", "/admin/requests", "/admin/invoices"],
  manager: ["/manager/dashboard", "/manager/projects", "/manager/requests", "/manager/invoices"],
  staff: ["/staff/dashboard", "/staff/projects", "/staff/kanban", "/staff/inventory"],
  client: ["/client/dashboard", "/client/requests", "/client/invoices", "/client/appointments"],
};

export function isItemEnabled(item: NavItem, flags: Partial<Record<FeatureKey, boolean>>): boolean {
  return !item.features || item.features.every((f) => flags[f]);
}

export function isItemActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.url) return true;
  return !item.exact && pathname.startsWith(`${item.url}/`);
}

export function tabBarItems(role: AppRole, flags: Partial<Record<FeatureKey, boolean>>): NavItem[] {
  const all = NAV_GROUPS[role].flatMap((g) => g.items);
  return TAB_BAR_URLS[role]
    .map((url) => all.find((i) => i.url === url))
    .filter((i): i is NavItem => !!i && isItemEnabled(i, flags));
}
