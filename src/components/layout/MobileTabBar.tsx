import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavCounts } from "@/hooks/useNavCounts";
import { isItemActive, tabBarItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Bottom navigation on phones (below 768px): the role's four main destinations
 * plus "More", which opens the full menu. Hidden on larger screens, where the
 * sidebar is always visible.
 */
export function MobileTabBar() {
  const { role } = useAuth();
  const { flags } = useFeatureFlags();
  const { has } = usePermissions();
  const counts = useNavCounts();
  const { setOpenMobile, openMobile } = useSidebar();
  const { pathname } = useLocation();

  if (!role) return null;
  const items = tabBarItems(role, flags, has);
  const anyActive = items.some((item) => isItemActive(item, pathname));

  const tabClass = (active: boolean) =>
    cn(
      "relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      {items.map((item) => {
        const active = isItemActive(item, pathname);
        const count = item.count ? counts[item.count] ?? 0 : 0;
        return (
          <Link key={item.url} to={item.url} className={tabClass(active)} aria-current={active ? "page" : undefined}>
            <span className="relative">
              <item.icon className="h-5 w-5" aria-hidden />
              {count > 0 && (
                <span className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-destructive px-1 text-center text-xs font-semibold leading-[18px] text-destructive-foreground">
                  {count > 99 ? "99+" : count}
                  <span className="sr-only"> need attention</span>
                </span>
              )}
            </span>
            {item.short ?? item.title}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className={tabClass(openMobile || !anyActive)}
        aria-label="More pages"
      >
        <Menu className="h-5 w-5" aria-hidden />
        More
      </button>
    </nav>
  );
}
