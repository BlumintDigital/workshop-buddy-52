import {
  LayoutDashboard, Briefcase, Calendar, Package, FileText, Users, Settings, LogOut, Wrench, ChevronDown, BarChart3, Columns3, UserCheck, CalendarDays, User,
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

type NavGroup = { label: string; items: { title: string; url: string; icon: any }[] };

const navGroups: Record<AppRole, NavGroup[]> = {
  admin: [
    { label: "Overview", items: [
      { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
    ]},
    { label: "Operations", items: [
      { title: "Jobs", url: "/admin/jobs", icon: Briefcase },
      { title: "Appointments", url: "/admin/appointments", icon: Calendar },
      { title: "Calendar", url: "/admin/calendar", icon: CalendarDays },
    ]},
    { label: "Management", items: [
      { title: "Inventory", url: "/admin/inventory", icon: Package },
      { title: "Invoices", url: "/admin/invoices", icon: FileText },
      { title: "Reports", url: "/admin/reports", icon: BarChart3 },
    ]},
    { label: "People", items: [
      { title: "Users", url: "/admin/users", icon: Users },
      { title: "Clients", url: "/admin/clients", icon: UserCheck },
    ]},
    { label: "System", items: [
      { title: "Settings", url: "/admin/settings", icon: Settings },
    ]},
  ],
  manager: [
    { label: "Overview", items: [
      { title: "Dashboard", url: "/manager/dashboard", icon: LayoutDashboard },
    ]},
    { label: "Operations", items: [
      { title: "Jobs", url: "/manager/jobs", icon: Briefcase },
      { title: "Appointments", url: "/manager/appointments", icon: Calendar },
      { title: "Calendar", url: "/manager/calendar", icon: CalendarDays },
    ]},
    { label: "Management", items: [
      { title: "Inventory", url: "/manager/inventory", icon: Package },
      { title: "Invoices", url: "/manager/invoices", icon: FileText },
    ]},
    { label: "People", items: [
      { title: "Staff", url: "/manager/staff", icon: Users },
    ]},
  ],
  staff: [
    { label: "Overview", items: [
      { title: "Dashboard", url: "/staff/dashboard", icon: LayoutDashboard },
    ]},
    { label: "Work", items: [
      { title: "My Jobs", url: "/staff/jobs", icon: Briefcase },
      { title: "Kanban", url: "/staff/kanban", icon: Columns3 },
      { title: "Schedule", url: "/staff/schedule", icon: Calendar },
    ]},
    { label: "Resources", items: [
      { title: "Inventory", url: "/staff/inventory", icon: Package },
    ]},
  ],
  client: [
    { label: "Overview", items: [
      { title: "Dashboard", url: "/client/dashboard", icon: LayoutDashboard },
    ]},
    { label: "My Account", items: [
      { title: "My Jobs", url: "/client/jobs", icon: Briefcase },
      { title: "Appointments", url: "/client/appointments", icon: Calendar },
      { title: "Invoices", url: "/client/invoices", icon: FileText },
    ]},
  ],
};

export function AppSidebar() {
  const { state, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { role, profile, signOut } = useAuth();

  const groups = navGroups[role || "client"];
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
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                <Wrench className="h-4 w-4" />
              </div>
              {!collapsed && (
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold text-sidebar-accent-foreground">Workshop Manager</span>
                  <span className="text-xs text-sidebar-foreground capitalize">{role || "user"}</span>
                </div>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator className="bg-sidebar-border" />

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/60 text-xs font-medium tracking-wider uppercase">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                      <NavLink
                        to={item.url}
                        end
                        className="text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground min-h-[44px] rounded-lg transition-colors duration-150"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-semibold border-l-2 border-sidebar-primary pl-[calc(0.75rem-2px)]"
                        onClick={handleNavClick}
                      >
                        <item.icon className="h-5 w-5" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="min-h-[44px] hover:bg-sidebar-accent/60 transition-colors duration-150">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-white/15 text-white text-xs font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <div className="flex flex-1 flex-col gap-0.5 leading-none">
                      <span className="text-sm font-medium text-sidebar-accent-foreground">{profile?.full_name || "User"}</span>
                      <span className="text-xs text-sidebar-foreground capitalize">{role}</span>
                    </div>
                  )}
                  {!collapsed && <ChevronDown className="ml-auto h-4 w-4 text-sidebar-foreground" />}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuItem onClick={() => { navigate("/profile"); setOpenMobile(false); }} className="min-h-[44px]">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
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
