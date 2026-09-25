/** "25 Sep 2026" in the viewer's locale, or an em dash when there is no date. */
export function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

/** "1 job", "3 jobs". Pass the plural form when adding "s" is wrong. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
