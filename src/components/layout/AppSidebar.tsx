import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, LogOut, Monitor, Moon, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useNavCounts, type NavCounts } from "@/hooks/useNavCounts";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolveLogoUrl, useDefaultLogoOnError } from "@/lib/branding";
import { NAV_GROUPS, isItemActive, isItemEnabled, type NavGroup, type NavItem } from "@/lib/navigation";

const COLLAPSE_KEY = "nav-collapsed-groups";

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}");
  } catch {
    return {};
  }
}

function NavItems({
  items,
  pathname,
  collapsed,
  counts,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
  counts: NavCounts;
  onNavigate: () => void;
}) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const count = item.count ? counts[item.count] ?? 0 : 0;
        return (
          <SidebarMenuItem key={item.url}>
            <SidebarMenuButton asChild isActive={isItemActive(item, pathname)} tooltip={item.title}>
              <NavLink
                to={item.url}
                end={item.exact}
                className="min-h-[44px] rounded-md text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                onClick={onNavigate}
              >
                <item.icon className="h-5 w-5" />
                {!collapsed && <span>{item.title}</span>}
              </NavLink>
            </SidebarMenuButton>
            {count > 0 && !collapsed && (
              <SidebarMenuBadge className="rounded-md bg-warning-soft px-1.5 text-warning" aria-label={`${count} need attention`}>
                {count}
              </SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function AppSidebar() {
  const { state, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { role, profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { flags } = useFeatureFlags();
  const counts = useNavCounts();
  const [workshopName, setWorkshopName] = useState("Workshop Manager");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(readCollapsed);

  useEffect(() => {
    supabase
      .from("workshop_settings")
      .select("workshop_name, logo_url")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        if ((data as any)?.workshop_name) setWorkshopName((data as any).workshop_name);
        if ((data as any)?.logo_url) setLogoUrl((data as any).logo_url);
      });

    const channel = supabase
      .channel("sidebar-workshop-settings")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workshop_settings" },
        (payload) => {
          const row = payload.new as any;
          if (row?.workshop_name) setWorkshopName(row.workshop_name);
          setLogoUrl(row?.logo_url ?? null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const groups: NavGroup[] = NAV_GROUPS[role || "client"]
    .map((g) => ({ ...g, items: g.items.filter((item) => isItemEnabled(item, flags)) }))
    .filter((g) => g.items.length > 0);

  const toggleGroup = (label: string, open: boolean) => {
    const next = { ...collapsedGroups, [label]: !open };
    setCollapsedGroups(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable: keep the choice for this session only.
    }
  };

  const initials = (profile?.full_name || "U").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleNavClick = () => setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="cursor-default hover:bg-transparent">
              <img src={resolveLogoUrl(logoUrl)} alt={workshopName} className="h-8 w-8 shrink-0 rounded-lg object-contain" onError={useDefaultLogoOnError} />
              {!collapsed && (
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold text-sidebar-accent-foreground">{workshopName}</span>
                  <span className="text-xs capitalize text-sidebar-foreground">{role || "user"}</span>
                </div>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator className="bg-sidebar-border" />

      <SidebarContent className="[&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
        <nav aria-label="Main menu" className="flex flex-col gap-2">
        {groups.map((group, index) => {
          const key = group.label ?? `group-${index}`;
          const items = (
            <NavItems items={group.items} pathname={location.pathname} collapsed={collapsed} counts={counts} onNavigate={handleNavClick} />
          );

          if (group.collapsible && group.label && !collapsed) {
            const containsActive = group.items.some((item) => isItemActive(item, location.pathname));
            const open = containsActive || collapsedGroups[group.label] === false;
            return (
              <Collapsible key={key} open={open} onOpenChange={(o) => toggleGroup(group.label!, o)} asChild>
                <SidebarGroup>
                  <SidebarGroupLabel asChild className="text-xs font-medium text-sidebar-foreground">
                    <CollapsibleTrigger className="flex w-full items-center gap-1 hover:text-sidebar-accent-foreground">
                      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {group.label}
                    </CollapsibleTrigger>
                  </SidebarGroupLabel>
                  <CollapsibleContent>
                    <SidebarGroupContent>{items}</SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            );
          }

          return (
            <SidebarGroup key={key}>
              {group.label && (
                <SidebarGroupLabel className="text-xs font-medium text-sidebar-foreground">{group.label}</SidebarGroupLabel>
              )}
              <SidebarGroupContent>{items}</SidebarGroupContent>
            </SidebarGroup>
          );
        })}
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="min-h-[44px] transition-colors duration-150 hover:bg-sidebar-accent/60">
                  <Avatar className="h-8 w-8">
                    {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name || "Avatar"} />}
                    <AvatarFallback className="bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">{initials}</AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <div className="flex flex-1 flex-col gap-0.5 leading-none">
                      <span className="text-sm font-medium text-sidebar-accent-foreground">{profile?.full_name || "User"}</span>
                      <span className="text-xs capitalize text-sidebar-foreground">{role}</span>
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
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Appearance</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light" className="min-h-[40px]">
                    <Sun className="mr-2 h-4 w-4" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark" className="min-h-[40px]">
                    <Moon className="mr-2 h-4 w-4" />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system" className="min-h-[40px]">
                    <Monitor className="mr-2 h-4 w-4" />
                    Match device
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
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
