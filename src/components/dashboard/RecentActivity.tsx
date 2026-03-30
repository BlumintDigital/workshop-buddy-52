import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Activity {
  id: string;
  title: string;
  status: string;
  date: string;
}

const statusVariant = (status: string) => {
  switch (status) {
    case "completed": return "default" as const;
    case "in_progress": return "secondary" as const;
    case "pending": return "outline" as const;
    case "review": return "secondary" as const;
    default: return "outline" as const;
  }
};

export function RecentActivity({ activities, title = "Recent Activity" }: { activities: Activity[]; title?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Latest updates across the workshop</CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No recent activity</p>
        ) : (
          <div className="space-y-4">
            {activities.map((a) => (
              <div key={a.id} className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.date}</p>
                </div>
                <Badge variant={statusVariant(a.status)}>{a.status.replace("_", " ")}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
