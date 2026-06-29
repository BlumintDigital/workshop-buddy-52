
# 2026 Dashboard Redesign — Dark + Violet, Command-Center Home

Reference: uploaded "Loud" dashboard (deep black, violet, lime accent, generous type, rounded glass cards) and "Frame" (soft 3D card energy). Functionality is preserved — this pass is presentation + the Admin home layout.

## 1. Design tokens (`src/index.css` + `tailwind.config.ts`)

New dark palette (HSL) as default theme:

- `--background` `240 20% 6%`  (#0B0B12)
- `--card` `240 18% 10%`        (#15151F)
- `--muted` `240 12% 16%`
- `--border` `240 10% 20%`
- `--primary` `258 90% 76%`     violet #A78BFA
- `--primary-foreground` `240 20% 6%`
- `--accent` `74 80% 66%`       lime #C7F060 (highlight only)
- `--ring` `258 90% 76%`
- Sidebar tokens re-tuned to the same near-black with violet active state.

Add token utilities:
- `--gradient-surface` subtle radial violet glow on cards
- `--shadow-glow` `0 0 0 1px hsl(258 90% 76% / 0.18), 0 20px 60px -20px hsl(258 90% 76% / 0.35)`
- `--radius` bumped to `1rem` for the 2026 pill/soft look

Typography: install `@fontsource-variable/geist` + `@fontsource/instrument-serif` for a display serif used only on hero numbers/welcome line (Loud-style). Body remains Geist.

Light theme kept but re-tinted to match (off-white surface, same violet primary) so existing toggles don't break.

## 2. Shared shell restyle (no logic changes)

- `AppSidebar.tsx` — narrower (w-16 collapsed / w-60), floating rounded card look, violet active pill, lime dot indicator for unread.
- `AppHeader.tsx` — translucent blur bar, larger search, pill segmented role badge, profile cluster styled like Loud.
- `card.tsx` — default to `rounded-2xl`, 1px violet-tinted border, ambient inner highlight.
- `button.tsx` — add `variant="glow"` (violet fill, soft outer glow) and `variant="soft"` (muted surface with violet text). Existing variants untouched.
- `badge.tsx`, `tabs.tsx`, `table.tsx`, `input.tsx` — restyled to new tokens; props unchanged.

All changes are token + className driven — no API breakage for consumers.

## 3. New dashboard primitives (`src/components/dashboard/`)

New presentational components (drop-in replacements, same data shape):

- `MetricCard.tsx` — large display number, delta chip, sparkline slot. Replaces `StatCard` visually, keeps the same props with an optional `sparkline`/`accent` prop.
- `SectionCard.tsx` — unified card frame with header, action slot, footer link.
- `HeatmapGrid.tsx` — Loud-style activity-by-hour grid (re-uses existing activity data).
- `LiveTickerStrip.tsx` — top strip: today's jobs, today's appointments, overdue invoices, low stock — each clickable.
- `QuickActions.tsx` — 4 primary CTAs (New Job, New Invoice, New Appointment, Add Client) with glow buttons.
- `RevenueHero.tsx` — big serif total + delta + range toggle (Week/Month/Year), violet bar viz like the reference.

`JobStatusChart`, `ActivityFeed`, `RecentActivity` get a restyle pass (new colors, rounded bars, subtler grid) — same props.

## 4. Admin home = live operational command center (`src/pages/admin/AdminDashboard.tsx`)

New single-screen layout (desktop 12-col, mobile stacked):

```text
┌──────────────────────────────────────────────────────────┐
│ Welcome serif headline · range toggle · QuickActions     │
├───── LiveTickerStrip (jobs today · appts · overdue · lowstock)
├──────────────────────────────────────────────────────────┤
│ RevenueHero (col-span-8)        │ Pending Approvals (4)  │
│                                 │  - invoices awaiting   │
│                                 │  - jobs in review      │
├──────────────────────────────────────────────────────────┤
│ MetricCard ×4 (Jobs, Appts, Inventory, Users)            │
├──────────────────────────────────────────────────────────┤
│ JobStatusChart (5) │ HeatmapGrid activity (4) │ Staff load (3)
├──────────────────────────────────────────────────────────┤
│ Today's Schedule (6)            │ Recent Activity (6)    │
├──────────────────────────────────────────────────────────┤
│ Low Stock Alerts · Onboarding checklist (collapsible)    │
└──────────────────────────────────────────────────────────┘
```

Data wiring (existing tables, no schema changes):
- Pending approvals: `invoices` where status='draft' and `jobs` where status='review'.
- Today's schedule: `appointments` + `jobs` due today.
- Staff load: grouped count of in-progress jobs per `assigned_staff_id`.
- Realtime: subscribe to `jobs`, `invoices`, `appointments`, `inventory_items` channels and refetch the affected widget (React Query `invalidateQueries`). Falls back to the existing 30s focus refetch we already have.
- All widgets gated by `useFeature` where applicable (appointments stays optional).

## 5. Other role dashboards

Same primitives, slimmer:
- `ManagerDashboard` — ticker + 4 metric cards + JobStatusChart + Today's Schedule + Recent Activity.
- `StaffDashboard` — "My Day" hero (assigned today, in-progress, completed), QuickActions limited to job actions, kanban shortcut.
- `ClientDashboard` — hero card with next appointment + open invoices total, MetricCard ×3, recent jobs timeline.

## 6. Out of scope (this pass)

- Inner pages (Jobs list, Invoice detail, Settings) keep current layouts; only inherit the new tokens/components automatically. A follow-up sprint can restyle those screens specifically.
- No data-model, RLS, or edge-function changes.
- No new dependencies beyond two `@fontsource` packages.

## 7. Verification

- Run `bun run build` and `tsgo` to confirm no type regressions.
- Visit `/admin`, `/manager`, `/staff`, `/client` via Playwright at 1280 and 390 viewports, capture screenshots, confirm no overflow / contrast issues.
- Vitest suite must stay green (only presentational changes).

## 8. Deliverables

1. Updated `index.css` + `tailwind.config.ts` tokens.
2. Restyled shell: sidebar, header, card, button, badge, input, table, tabs.
3. New components: `MetricCard`, `SectionCard`, `HeatmapGrid`, `LiveTickerStrip`, `QuickActions`, `RevenueHero`.
4. Rewritten `AdminDashboard.tsx` command-center layout with realtime hooks.
5. Restyled Manager/Staff/Client dashboards using the new primitives.
6. Playwright screenshots attached at the end for sign-off.
