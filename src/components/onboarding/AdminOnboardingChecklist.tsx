import { Link } from "react-router-dom";
import { CheckCircle2, Circle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminOnboarding } from "@/hooks/useAdminOnboarding";

export function AdminOnboardingChecklist() {
  const {
    activeSteps,
    activeCompletedCount,
    dismissed,
    loading,
    updating,
    skipStep,
    dismissOnboarding,
  } = useAdminOnboarding();

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-56" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (dismissed || activeSteps.length === 0 || activeSteps.every((step) => step.completed)) {
    return null;
  }

  const progress = Math.round((activeCompletedCount / activeSteps.length) * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl">First-time setup</CardTitle>
            <p className="text-sm text-muted-foreground">
              {activeCompletedCount} of {activeSteps.length} done
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={updating}
            onClick={() => void dismissOnboarding()}
          >
            <X className="mr-1 h-4 w-4" />
            Dismiss
          </Button>
        </div>
        <Progress value={progress} className="mt-3 h-2" />
      </CardHeader>
      <CardContent className="space-y-2">
        {activeSteps.map((step) => (
          <div key={step.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
              {step.completed ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium leading-tight">{step.title}</p>
                  {step.completed && <Badge variant="secondary">Done</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2 sm:justify-end">
              <Button asChild variant={step.completed ? "outline" : "default"} size="sm">
                <Link to={step.href}>{step.completed ? "View" : step.cta}</Link>
              </Button>
              {!step.completed && step.skippable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={updating}
                  onClick={() => void skipStep(step.id)}
                >
                  Skip
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
