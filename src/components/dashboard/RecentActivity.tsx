import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  title: string;
  status: string;
  date: string;
}

const statusStyle = (status: string) => {
  switch (status) {
    case "completed":
      return "bg-accent/15 text-accent border-accent/30";
    case "in_progress":
      return "bg-primary/15 text-primary border-primary/30";
    case "pending":
      return "bg-muted text-muted-foreground border-border";
    case "review":
      return "bg-amber-400/15 text-amber-400 border-amber-400/30";
    case "cancelled":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
};

export function RecentActivity({ activities, title = "Recent Activity" }: { activities: Activity[]; title?: string }) {
  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <CardDescription className="text-xs">Latest updates across the workshop</CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {activities.map((a) => (
              <div key={a.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-transparent px-2 py-2 transition-colors hover:border-border/60 hover:bg-card/40">
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium leading-none">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.date}</p>
                </div>
                <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize", statusStyle(a.status))}>
                  {a.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
