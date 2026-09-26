import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/NotificationBell";
import { SessionIndicator } from "@/components/SessionIndicator";
import { GlobalSearch } from "./GlobalSearch";
import { Link, useLocation } from "react-router-dom";
import { useAuth, getRoleDashboardPath } from "@/hooks/useAuth";
import { isIdSegment, useRegisteredLabel } from "@/lib/breadcrumbs";

const ROLE_SCOPED_SEGMENTS = new Set(["invoices", "projects", "appointments", "reports", "users", "clients", "calendar", "activity-logs", "settings", "feedback", "dashboard"]);

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  appointments: "Appointments",
  inventory: "Inventory",
  invoices: "Invoices",
  reports: "Reports",
  users: "Users",
  clients: "Clients",
  calendar: "Calendar",
  "activity-logs": "Activity Logs",
  settings: "Settings",
  feedback: "Feedback",
  usage: "Usage by project",
  reception: "Reception",
  teams: "Teams and access",
};

const HOME_LABEL: Record<string, string> = { admin: "Today", manager: "Today", staff: "My day", client: "Your orders" };

function toLabel(segment: string, role: string | null) {
  if (segment === "dashboard" && role) return HOME_LABEL[role] ?? LABELS.dashboard;
  if (isIdSegment(segment)) return "Details";
  return LABELS[segment] ?? segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AppHeader() {
  const location = useLocation();
  const { role } = useAuth();
  const pageLabel = useRegisteredLabel(location.pathname);

  const rawSegments = location.pathname.split("/").filter(Boolean);
  const hasRolePrefix = rawSegments[0] === "admin" || rawSegments[0] === "manager" || rawSegments[0] === "staff" || rawSegments[0] === "client";
  // Build crumbs from all segments except the role prefix; for top-level role-scoped sections
  // (e.g. /invoices/new) route the link through the user's role landing page.
  const crumbs = rawSegments.reduce<Array<{ label: string; href: string }>>((acc, seg, i) => {
    if (i === 0 && hasRolePrefix) return acc;
    let href = "/" + rawSegments.slice(0, i + 1).join("/");
    if (!hasRolePrefix && i === 0 && role && ROLE_SCOPED_SEGMENTS.has(seg)) {
      href = `/${role}/${seg}`;
    }
    const isLast = i === rawSegments.length - 1;
    return [...acc, { label: isLast && pageLabel ? pageLabel : toLabel(seg, role), href }];
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 backdrop-blur-sm px-4 sticky top-0 z-10">
      <SidebarTrigger className="-ml-1 min-h-[44px] min-w-[44px]" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {/* Home crumb — always shown */}
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={role ? getRoleDashboardPath(role) : "/"} className="inline-flex min-h-[44px] items-center text-sm sm:text-base">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>

          {crumbs.length > 0 && <BreadcrumbSeparator />}

          {crumbs.length === 1 && (
            <BreadcrumbItem>
              <BreadcrumbPage className="text-sm sm:text-base font-medium">{crumbs[0].label}</BreadcrumbPage>
            </BreadcrumbItem>
          )}

          {crumbs.length === 2 && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={crumbs[0].href} className="inline-flex min-h-[44px] items-center text-sm sm:text-base">{crumbs[0].label}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-sm sm:text-base font-medium">{crumbs[1].label}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}

          {crumbs.length >= 3 && (
            <>
              <BreadcrumbItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-9 w-9">
                      <BreadcrumbEllipsis className="h-4 w-4" />
                      <span className="sr-only">Show intermediate pages</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuGroup>
                      {crumbs.slice(0, -1).map((crumb) => (
                        <DropdownMenuItem key={crumb.href} asChild>
                          <Link to={crumb.href}>{crumb.label}</Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-sm sm:text-base font-medium">
                  {crumbs[crumbs.length - 1].label}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <GlobalSearch />
        <SessionIndicator />
        <NotificationBell />
      </div>
    </header>
  );
}
