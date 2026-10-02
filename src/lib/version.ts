// The version of Shoplane this browser is running (the commit it was built from), for support
// and for Shoplane Control's release checks. Tests and the dev server see "dev".
export const APP_VERSION: string = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
export const APP_BUILT_AT: string | null = typeof __APP_BUILT_AT__ !== "undefined" ? __APP_BUILT_AT__ : null;

/** "a4ebb7f · built 2 Oct 2026" */
export function versionLabel(): string {
  const short = APP_VERSION === "dev" ? "development build" : APP_VERSION.slice(0, 7);
  const built = APP_BUILT_AT ? ` · built ${new Date(APP_BUILT_AT).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : "";
  return `${short}${built}`;
}
