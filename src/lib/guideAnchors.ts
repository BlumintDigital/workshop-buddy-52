/** Anchor id for a user guide heading, e.g. "5.9 Reception" -> "5-9-reception". Used by /help and the page help. */
export function guideSlug(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
