import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { NotificationBell } from "@/components/NotificationBell";
import { useLocation } from "react-router-dom";

export function AppHeader() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  const pageTitle = segments[segments.length - 1]?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Dashboard";

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1 min-h-[44px] min-w-[44px]" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="text-sm sm:text-base">{pageTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto">
        <NotificationBell />
      </div>
    </header>
  );
}
