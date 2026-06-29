## Goal

Two scoped changes:
1. Global visual switch from dark to a light, pastel theme (Sage & Cream) — applied across every page via design tokens, not per-page rewrites.
2. Redesign the admin dashboard only (`/admin/dashboard`) into a modern bento-grid layout. All other pages keep their current layouts.

Locked design picks:
- Palette: Sage & Cream — `#f5f0e8` cream, `#dce5d4` mist, `#a8c0a0` sage, `#7d9b76` deep sage
- Type: Outfit (headings) + Figtree (body)
- Dashboard layout: bento grid

## Part 1 — Global light pastel theme

Token-level swap so every page inherits the new look without touching their components.

- `index.html`: remove the forced `dark` class so the app boots in light mode.
- `src/index.css`:
  - Replace the root HSL tokens (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--border`, `--input`, `--ring`, sidebar tokens, chart colors) with HSL equivalents of the Sage & Cream palette.
  - Background = cream `#f5f0e8`; cards = soft white with a faint mist tint; primary = deep sage `#7d9b76`; accents = sage `#a8c0a0`; borders = mist `#dce5d4`.
  - Replace the existing violet/lime gradient utilities and `glow` shadows with softer pastel gradients (`--gradient-surface`, `--gradient-soft`, `--gradient-hero`) and gentle `--shadow-soft` / `--shadow-elevation` shadows.
  - Keep the `.dark` block but retarget it to a muted dusk-sage variant so any explicit dark consumer still renders coherently.
- `tailwind.config.ts`:
  - Register Outfit as `font-display` / heading and Figtree as `font-sans` / body.
  - Keep semantic color mappings; no hard-coded hex in components.
- `src/main.tsx`: import `@fontsource/outfit` (400/500/600/700) and `@fontsource/figtree` (400/500/600).
- Card primitive (`src/components/ui/card.tsx`): tone down the heavy glassmorphism (`backdrop-blur-xl`, dark surface) to a clean light card — soft border, `bg-card`, `shadow-soft`, `rounded-2xl`. Variants for pastel-tinted cards (`sage`, `mist`, `cream`) so the dashboard can opt into colored bento tiles without one-off classes.
- Button primitive (`src/components/ui/button.tsx`): retune `glow` and `soft` variants for the pastel palette; default stays semantic.

Because every page consumes these tokens, the rest of the app (jobs, invoices, settings, auth, client/staff dashboards, etc.) shifts to light pastel automatically with no per-page edits.

## Part 2 — Admin dashboard bento redesign

Only `src/pages/admin/AdminDashboard.tsx` and the dashboard-specific primitives it uses are rebuilt. Same data sources and queries as today (revenue, jobs, appointments, staff load, low stock, approvals, currency) — just a new composition.

Layout (12-col responsive grid, stacks to 1 column on mobile):

```text
┌──────────────────────────────┬───────────────┐
│ Revenue hero (6 months)      │ Today’s       │
│ big number + sparkline       │ schedule      │
│ col-span-8, row-span-2       │ col-span-4    │
│                              │ row-span-2    │
├──────────┬─────────┬─────────┼───────────────┤
│ Active   │ Pending │ Low     │ Quick actions │
│ jobs     │ approv. │ stock   │ (new job /    │
│ tile     │ tile    │ tile    │  invoice /    │
│ col-3    │ col-3   │ col-2   │  appointment) │
├──────────┴─────────┴─────────┤ col-4         │
│ Staff workload bars          │               │
│ col-span-8                   │               │
└──────────────────────────────┴───────────────┘
```

Each tile is a pastel `Card` variant (alternating cream / mist / sage tint) with Outfit headings, large metric numerals, subtle `shadow-soft`, and `rounded-2xl` corners. Sparklines and bars recolored to the sage scale. The live ticker strip is folded into a slim header band above the grid.

Design directions step: once this plan is approved, the first build-mode action will be to capture the current dashboard, call `design--create_directions` with the locked palette/type/layout to produce 3 bento-grid variants, then ask the user to pick one via `ask_questions` (prototype). Implementation follows the picked direction exactly.

## Out of scope

- No layout changes to any other page (jobs, invoices, clients, inventory, appointments, settings, auth, client/staff dashboards). They only inherit the new tokens.
- No data model, RLS, or query changes.
- No new dependencies beyond the two `@fontsource` packages.

## Technical notes

- HSL-only tokens in `index.css` so Tailwind color utilities resolve correctly.
- `useCurrency` and all realtime subscriptions on the dashboard stay as-is.
- Card variant additions are additive — existing `<Card>` usages keep working unchanged.
- The forced-dark removal in `index.html` is the single switch that flips the whole app to light; no per-component class edits needed.
