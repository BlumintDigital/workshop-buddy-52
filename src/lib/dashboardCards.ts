// Card registry for the customisable admin/manager "Today" dashboard.
// Card rendering lives in components/dashboard/TodayDashboard.tsx; this file only
// knows ids, labels and role defaults so the layout logic stays testable.

import type { AppRole } from "@/hooks/useAuth";

export type CardId =
  | "attention"
  | "figures"
  | "onboarding"
  | "jobs"
  | "schedule"
  | "team"
  | "revenue"
  | "activity";

export type CardMeta = {
  id: CardId;
  title: string;
  description: string;
  /** Required cards cannot be hidden (they can still be reordered). */
  required?: boolean;
  /** Roles that can use the card, with its default visibility for each. */
  defaults: Partial<Record<AppRole, boolean>>;
  /** Feature flag the card depends on, if any. */
  feature?: "appointments";
};

export const CARDS: CardMeta[] = [
  { id: "attention", title: "Needs attention", description: "Overdue invoices, sign-offs, low stock and more", required: true, defaults: { admin: true, manager: true } },
  { id: "onboarding", title: "Setup checklist", description: "Steps left to finish setting up the workshop", defaults: { admin: true } },
  { id: "figures", title: "Figures", description: "Revenue, open projects, money owed, appointments", defaults: { admin: true, manager: true } },
  { id: "jobs", title: "Projects in progress", description: "Open projects, soonest due first", defaults: { admin: true, manager: true } },
  { id: "schedule", title: "Today's appointments", description: "Bookings for today", feature: "appointments", defaults: { admin: true, manager: true } },
  { id: "team", title: "Team load", description: "Open projects and estimated hours per person", defaults: { admin: true, manager: true } },
  { id: "revenue", title: "Revenue trend", description: "Paid invoices over the last 6 months", defaults: { admin: true, manager: false } },
  { id: "activity", title: "Activity feed", description: "Recent changes across the workshop", defaults: { admin: false } },
];

export type DashboardPrefs = { order: string[]; hidden: string[] };

export type LayoutEntry = { meta: CardMeta; visible: boolean };

export function cardsForRole(role: AppRole, features: { appointments: boolean }): CardMeta[] {
  return CARDS.filter((c) => role in c.defaults && (!c.feature || features[c.feature]));
}

/**
 * Merges saved prefs with the registry: saved order first (unknown ids dropped),
 * then any cards added since the prefs were saved, in registry order.
 * Cards the user has never seen take their role default visibility.
 */
export function resolveLayout(
  role: AppRole,
  prefs: DashboardPrefs | null,
  features: { appointments: boolean },
): LayoutEntry[] {
  const available = cardsForRole(role, features);
  const byId = new Map(available.map((c) => [c.id as string, c]));
  const seen = new Set(prefs?.order ?? []);

  const ordered: CardMeta[] = [];
  for (const id of prefs?.order ?? []) {
    const meta = byId.get(id);
    if (meta && !ordered.includes(meta)) ordered.push(meta);
  }
  for (const meta of available) {
    if (!ordered.includes(meta)) ordered.push(meta);
  }

  return ordered.map((meta) => {
    if (meta.required) return { meta, visible: true };
    if (prefs && (seen.has(meta.id) || prefs.hidden.includes(meta.id))) {
      return { meta, visible: !prefs.hidden.includes(meta.id) };
    }
    return { meta, visible: meta.defaults[role] ?? false };
  });
}

/** Serialises a layout back into prefs. */
export function layoutToPrefs(layout: LayoutEntry[]): DashboardPrefs {
  return {
    order: layout.map((e) => e.meta.id),
    hidden: layout.filter((e) => !e.visible).map((e) => e.meta.id),
  };
}

export function moveCard(layout: LayoutEntry[], id: CardId, direction: -1 | 1): LayoutEntry[] {
  const index = layout.findIndex((e) => e.meta.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= layout.length) return layout;
  const next = [...layout];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function setCardVisible(layout: LayoutEntry[], id: CardId, visible: boolean): LayoutEntry[] {
  return layout.map((e) => (e.meta.id === id && !e.meta.required ? { ...e, visible } : e));
}
