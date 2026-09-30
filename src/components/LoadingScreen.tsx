import shoplaneMarkUrl from "@/assets/shoplane-mark.svg";

export default function LoadingScreen() {
  return (
    <main aria-busy="true" className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background animate-fade-in">
      <div className="flex flex-col items-center gap-3">
        <img src={shoplaneMarkUrl} alt="" className="h-14 w-14 rounded-xl shadow-lg" />
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Shoplane</h1>
      </div>
      <div className="w-48 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full w-1/3 rounded-full bg-primary animate-indeterminate" />
      </div>
      <p className="text-sm text-muted-foreground">Loading your workspace...</p>
    </main>
  );
}
