# Today dashboard: design brief

Sources: the shadcnstudio admin dashboard templates page (its previews are images, so it gave little
beyond "Recharts charts, TanStack tables, page headers") and 18 shots sampled across 2023 to November
2026 from the nizamdesign-dashboards folder. The useful ones are the operational dashboards (kitchen
prep board, contract alerts, payments, care scheduling, campaign tables), not the fintech or AI mockups.

Who it's for: a workshop owner or manager, glancing at it between jobs, often on a phone. They need
to know what to chase first and whether the week is going well. Everything else is a click away.

## Adopt

- **A KPI strip of plain numbers.** Label, one big figure, one line of context that says what it
  compares to ("3 due today or late", "Up 12% on last month"). Each figure opens the list behind it.
  No icons, sparklines or mini charts inside the tiles. One hairline grid, not separate cards.
- **A To do summary, one line per kind.** The pattern from the contract-alerts and prep-board shots:
  exact count first in its own aligned column, then a plain sentence naming the problem, a short
  preview underneath, a state label and a chevron. The whole line is the link. Most urgent first.
  The number must be the real server count, never the length of a capped list.
- **Ratios with their working shown.** "80%" alone is a guess; "60 of 75 hours this week" under it
  is a fact. When there's nothing to divide, say why ("No quotes decided in the last 90 days")
  instead of showing 0%. Say how the figure is worked out in one muted line at the foot of the card.
- **One rich element.** The revenue bars are the only chart. The current month carries the brand
  colour; earlier months are a tint of it. Everything else stays neutral.
- **Density.** 16px card padding, 56 to 60px list rows, 16px gaps between cards. Tabular figures
  everywhere. Two weights: 400 for text, 600 for figures and headings.
- **States.** Skeletons while loading, an error with "Try again" if a load fails, and an explained
  empty state. A card never shows 0 or £0.00 that it doesn't know.

## Avoid

- Pastel colour-block cards, glows, gradients and floating 3D objects (common in the folder, wrong
  for a tool used all day).
- Uppercase, letter-spaced or monospace section labels used as decoration.
- AI sparkle icons and "insight" panels; donut and gauge charts for a single share.
- Greeting headlines ("Welcome back"). The title is "Today" and the date.
- Colour as the only signal. Every coloured state also has words: a pill label, "late", "overdue".
- Money for people without Billing, and project costs for people without Reports.

## Layout

1. Figures strip (full width): open projects, intake, awaiting payment, revenue or quality check,
   appointments.
2. To do (full width, required).
3. Projects in progress (full width), then half-width pairs: labour efficiency with quote
   conversion, appointments with team load, revenue. Owners can still hide and reorder every card.
