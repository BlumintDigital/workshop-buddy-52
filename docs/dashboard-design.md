# Today dashboard: design brief

Second pass, November 2026. The founder asked for "a combination of both styles", shadcnstudio and
Nizam. The first pass read as a cleaner version of the old page. This one takes structure and
restraint from shadcnstudio and hierarchy and finish from Nizam.

Sources:

- shadcnstudio live previews, looked at in a browser: AdminCN Sales and Finance, NexaCRM Analytics,
  Sprintrix Projects.
- 48 Nizam shots from the nizamdesign-dashboards folder, 8 from 2025 and 40 from 2026, spread across
  the year. The ones closest to Shoplane were the trade and operations screens. Piona "Money" is a
  field-service money page. Fixora is a property maintenance home. Margin "Job #5819" shows estimate
  against actual. Mise covers forecast and inventory. Vetted covers risk and findings.

Who it's for: a workshop owner or manager, glancing at it between jobs, often on a phone. They need
to know what to chase first and whether the week is going well.

## Taken from shadcnstudio

1. **Separate KPI cards in a tidy row.** Five equal cards across the top, each with the same padding
   and a label, figure, footer structure. They replace the single hairline strip.
2. **Card header pattern.** A title plus one muted line saying what the card shows ("Paid invoices,
   by the month they were paid"), with the action link on the right. It is the `Panel`
   `description` prop.
3. **Real table structure for lists.** "Projects in progress" gets a quiet column header row
   (Project, Lead, Stage, Due) on a muted band, fixed column widths, and the due date right-aligned.
   This follows the Sprintrix projects list and the AdminCN invoice table.
4. **People shown as initials.** Avatars with initials next to lead names and in Team load, as in
   the Sprintrix lead column.
5. **Restrained palette.** Neutral cards on a light grey page, one brand colour for the current
   period and the primary action. Semantic colours only on state.
6. **Small charts inside figure cards, only where the data is real.** The six-month revenue bars
   and the overdue share of unpaid sit under their figures. Cards with no series stay plain numbers.
7. **Rounded-xl cards with a small shadow and a hairline border.** Density stays even: 20px card
   padding, 16px gaps, 56 to 64px rows.

## Taken from Nizam

1. **A confident headline area.** A large "Today" with one sentence under it that says what matters:
   "Wednesday 18 November · 10 things to do, 1 urgent". Taken from Fixora's "23 urgent work orders
   need attention", without the greeting.
2. **Comparison stated, with direction in words and an arrow.** "▲ 12% vs Oct" in a soft pill,
   as in Piona's "was 13 in QuickBooks" and Fixora's "+3 pts". When there's nothing to compare,
   the card says so ("Nothing paid in Oct to compare").
3. **Severity count tiles.** Each To do line leads with its exact count in a tinted tile, as in
   Piona's reminder chips and Vetted's findings list. The pill on the same line says the severity in
   words, so colour never carries it alone.
4. **One rich chart, given the width.** Revenue is a full-width card with the month's figure set
   large above it, the six-month total opposite, dashed guide lines and a quiet axis. Empty months
   keep a hairline stub and no label, so there is no row of "None".
5. **Working shown beside a ratio.** A big percentage, a meter, then the counts behind it ("2 of 2
   quotes approved, last 90 days"). Taken from Mise's "312 expected covers, +18% vs a typical
   Tuesday". How it's worked out moves into an info popover, so it no longer adds a heavy footer.
6. **Quiet empty states that keep the shape.** A ratio with nothing to divide shows one line ("No
   figure yet. No hours logged this week yet.") and a dashed empty track where the meter will be.
   The pair of cards still lines up.
7. **Figures set large, labels small.** Weight 600 and tabular figures for numbers, 400 for text, a
   clear jump between them.

## Avoid

- Pastel colour-block cards, glows, gradients and floating 3D objects.
- AI sparkle icons and "insight" panels; donut and gauge charts for a single share.
- Greeting headlines ("Good morning"). The title is "Today".
- Uppercase, letter-spaced section labels.
- Colour as the only signal. Every coloured state also has words.
- Charts with no real series behind them. No sparkline is drawn from made-up or padded data.
- Money for people without Billing, and project costs for people without Reports.

## Layout

1. Headline: "Today", then the date and the To do summary sentence. Refresh and New on the right.
2. Figures: open projects, intake, awaiting payment (with the overdue share), revenue this month
   (with six-month bars and the change on last month) or quality check for managers, appointments.
3. To do (full width, required).
4. Projects in progress (full width table).
5. Half-width pairs: labour efficiency with quote conversion, appointments with team load.
6. Revenue (full width chart), then recent activity.

Owners can still hide and reorder every card through Customise.

## Notes

- In a Playwright full-page screenshot the sidebar background stops at the first screen. That is
  how full-page capture treats a fixed, screen-high sidebar. A normal screenshot scrolled to the
  bottom shows it at full height, so there is nothing to fix in the layout.
