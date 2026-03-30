import {
  LayoutDashboard, Briefcase, Calendar, Package, FileText, Users, Settings, LogOut, Wrench, ChevronDown, BarChart3, Columns3, UserCheck, CalendarDays,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AppRole = "admin" | "manager" | "staff" | "client";

const navItems: Record<AppRole, { title: string; url: string; icon: any }[]> = {
  admin: [
    { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
    { title: "Jobs", url: "/admin/jobs", icon: Briefcase },
    { title: "Appointments", url: "/admin/appointments", icon: Calendar },
    { title: "Calendar", url: "/admin/calendar", icon: CalendarDays },
    { title: "Inventory", url: "/admin/inventory", icon: Package },
    { title: "Invoices", url: "/admin/invoices", icon: FileText },
    { title: "Reports", url: "/admin/reports", icon: BarChart3 },
    { title: "Users", url: "/admin/users", icon: Users },
    { title: "Clients", url: "/admin/clients", icon: UserCheck },
    { title: "Settings", url: "/admin/settings", icon: Settings },
  ],
  manager: [
    { title: "Dashboard", url: "/manager/dashboard", icon: LayoutDashboard },
    { title: "Jobs", url: "/manager/jobs", icon: Briefcase },
    { title: "Appointments", url: "/manager/appointments", icon: Calendar },
    { title: "Inventory", url: "/manager/inventory", icon: Package },
    { title: "Invoices", url: "/manager/invoices", icon: FileText },
    { title: "Staff", url: "/manager/staff", icon: Users },
  ],
  staff: [
    { title: "Dashboard", url: "/staff/dashboard", icon: LayoutDashboard },
    { title: "My Jobs", url: "/staff/jobs", icon: Briefcase },
    { title: "Kanban", url: "/staff/kanban", icon: Columns3 },
    { title: "Schedule", url: "/staff/schedule", icon: Calendar },
    { title: "Inventory", url: "/staff/inventory", icon: Package },
  ],
  client: [
    { title: "Dashboard", url: "/client/dashboard", icon: LayoutDashboard },
    { title: "My Jobs", url: "/client/jobs", icon: Briefcase },
    { title: "Appointments", url: "/client/appointments", icon: Calendar },
    { title: "Invoices", url: "/client/invoices", icon: FileText },
  ],
};

export function AppSidebar() {
  const { state, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { role, profile, signOut } = useAuth();

  const items = navItems[role || "client"];
  const initials = (profile?.full_name || "U").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleNavClick = () => {
    setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="cursor-default hover:bg-transparent">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wrench className="h-4 w-4" />
              </div>
              {!collapsed && (
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Workshop Manager</span>
                  <span className="text-xs text-muted-foreground capitalize">{role || "user"}</span>
                </div>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-muted/50 min-h-[44px]"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      onClick={handleNavClick}
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="min-h-[44px]">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <div className="flex flex-1 flex-col gap-0.5 leading-none">
                      <span className="text-sm font-medium">{profile?.full_name || "User"}</span>
                      <span className="text-xs text-muted-foreground capitalize">{role}</span>
                    </div>
                  )}
                  {!collapsed && <ChevronDown className="ml-auto h-4 w-4" />}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuItem onClick={handleSignOut} className="min-h-[44px]">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
