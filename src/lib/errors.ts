/**
 * After a deploy, a page left open still points at the old code files, which
 * no longer exist. That isn't a bug; reloading picks up the new version.
 */
export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Unable to preload CSS/i.test(message);
}

/** What someone reporting the problem should paste: enough to find it, nothing personal. */
export function errorReport(error: Error): string {
  return [
    `Error: ${error.message}`,
    `Page: ${window.location.pathname}`,
    `Time: ${new Date().toISOString()}`,
    `Browser: ${navigator.userAgent}`,
    "",
    (error.stack ?? "").split("\n").slice(0, 8).join("\n"),
  ].join("\n");
}

const RELOADED_KEY = "stale-build-reloaded-at";

/**
 * A page opened before a deploy can't load the new code. Reload once, quietly,
 * rather than show an error; the timestamp stops a reload loop if the files
 * really are missing.
 */
export function reloadOnceForStaleBuild(error: unknown): boolean {
  if (!isStaleBuildError(error)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOADED_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
