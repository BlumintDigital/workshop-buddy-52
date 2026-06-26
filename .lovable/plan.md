## Workshop Buddy User Guide — Plan

Produce a comprehensive (25-35 page) user guide covering Admin, Manager, Staff, and Client roles. Deliver as both a professional PDF (hosted on Lovable CDN) and an in-app help page accessible to every signed-in user.

### Deliverables

1. **`docs/user-guide.md`** — Markdown source of truth, organized by section so it can also render in-app.
2. **`/mnt/documents/user-guide.pdf`** — Professionally styled PDF generated with reportlab using the same navy/blue branding as the deploy guide.
3. **CDN upload** — `public/docs/user-guide.pdf.asset.json` pointer via `lovable-assets`.
4. **In-app page** — new route `/help` (`src/pages/Help.tsx`), wrapped in `DashboardLayout`, with:
   - Sidebar table of contents (sticky)
   - Rendered guide content (markdown → React via `react-markdown` if available, otherwise structured sections)
   - "Open PDF" and "Download PDF" buttons linking to the CDN asset
5. **Routing & nav** — register `/help` in `src/App.tsx` for all four roles; add a "Help & Guide" link in `AppSidebar.tsx` (footer area, visible to every role).

### Guide structure (sections)

1. **Welcome** — what Workshop Buddy is, who each role is for
2. **Getting Started** — signing up with invite code, signing in, password reset, MFA setup (TOTP, backup codes, trusted devices)
3. **Navigating the App** — layout tour: sidebar, header, breadcrumbs, notifications bell, broadcasts banner, profile menu, session timeout
4. **Admin Guide** — dashboard, users, clients, signup codes, settings (branding, features, currency, email), activity logs, feedback, access review, factory reset, deploy guide
5. **Manager Guide** — dashboard, jobs, appointments, inventory, invoices, staff management, calendar
6. **Staff Guide** — dashboard, assigned jobs, kanban board, schedule, inventory lookup
7. **Client Guide** — dashboard, my jobs, my appointments, my invoices, booking
8. **Core Workflows** (cross-role)
   - Jobs: create → assign → progress → complete → auto-invoice
   - Appointments: drag-drop scheduling, client self-booking
   - Invoices: create, send, Stripe link, PDF, mark paid, push notify client
   - Inventory: stock levels, low-stock alerts
9. **Notifications** — in-app bell, push notification opt-in, email notifications
10. **Security & Account** — MFA, trusted devices, backup codes, password change, profile, report an issue
11. **FAQ & Troubleshooting** — common issues (currency not updating, MFA loop, push not arriving, can't sign up)
12. **Glossary** — roles, statuses, terms

### Technical notes

- Reuse the PDF generator pattern from the deploy-guide PDF: reportlab with custom markdown parser, navy/blue palette, page numbers, footer, cover page with Workshop Buddy logo/title.
- Branding stays on platform tokens (no hardcoded colors in the React `Help` page — use existing semantic tokens like `bg-card`, `text-foreground`).
- Markdown rendering in the in-app page: check if `react-markdown` is installed; if not, render structured JSX directly from the same content to avoid adding a dependency unnecessarily. (Will decide on inspection in build mode.)
- QA: convert every PDF page to JPEG and visually inspect for clipping, overflow, broken tables, before declaring done.

### Files created / edited

- create `docs/user-guide.md`
- create `src/pages/Help.tsx`
- create `public/docs/user-guide.pdf.asset.json`
- edit `src/App.tsx` (register `/help` route)
- edit `src/components/layout/AppSidebar.tsx` (add Help link for all roles)

No backend, schema, or business-logic changes.
