import { Wrench } from "lucide-react";

export default function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background animate-fade-in">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
          <Wrench className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Workshop Manager</h1>
      </div>
      <div className="w-48 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full w-1/3 rounded-full bg-primary animate-indeterminate" />
      </div>
      <p className="text-sm text-muted-foreground">Loading your workspace...</p>
    </div>
  );
}
