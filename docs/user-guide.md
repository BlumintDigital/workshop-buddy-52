# Workshop Buddy — User Guide

A complete reference for Admins, Managers, Staff, and Clients.

---

## 1. Welcome

Workshop Buddy is a workshop management platform that helps your team run jobs, appointments, inventory, and invoicing from a single shared workspace. Every account on the platform belongs to one of four roles, each with a tailored experience:

- **Admin** — full control of the workspace: users, settings, reports, billing, and security.
- **Manager** — runs day-to-day operations: jobs, appointments, inventory, invoicing, and staff.
- **Staff** — works on assigned jobs through a streamlined kanban and schedule view.
- **Client** — tracks their own jobs, appointments, and invoices through a self-service portal.

The guide is organised so you can jump straight to your role, or read across roles to understand how work flows through the system.

---

## 2. Getting Started

### 2.1 Signing up

New accounts require an **invite code** issued by your workshop admin.

1. Open the **Sign in** page and switch to the **Create account** tab.
2. Enter your full name, email, password, and the invite code provided by your admin.
3. Click **Create account**. You will receive an email asking you to confirm your address.
4. After confirmation you can sign in.

If you don't have an invite code, ask your workshop administrator to generate one for you from **Admin → Signup Codes**.

### 2.2 Signing in

1. Go to the sign-in page and enter your email and password.
2. If multi-factor authentication is enabled on your account, you'll be asked for a 6-digit code from your authenticator app.
3. After signing in you'll land on the dashboard for your role.

### 2.3 Forgot password

Click **Forgot password** on the sign-in page, enter your email, and follow the link sent to your inbox to set a new password.

### 2.4 Multi-factor authentication (MFA)

We strongly recommend enabling MFA for every user.

1. Open **Profile → Security**.
2. Click **Enable MFA**, scan the QR code with your authenticator app (Google Authenticator, 1Password, Authy), and enter the 6-digit code to verify.
3. **Save your backup codes** — these are one-time codes used if you lose your device. Store them somewhere safe.
4. Optionally check **Trust this device for 30 days** at sign-in to skip the MFA prompt on devices you control.

You can regenerate backup codes or revoke trusted devices any time from **Profile → Security**.

---

## 3. Navigating the App

Every signed-in page shares the same shell:

- **Sidebar (left)** — primary navigation. Collapses to icons on smaller screens. The trigger in the header expands or collapses it.
- **Header (top)** — breadcrumbs, notification bell, and broadcast banner area.
- **Notification bell** — shows unread in-app notifications. Click to view recent activity and mark them as read.
- **Broadcast banner** — system-wide notices from your administrator appear here. Use the X to dismiss.
- **Profile menu (sidebar footer)** — access your profile, security settings, and sign out.
- **Session timer** — for security, you are signed out after 30 minutes of inactivity. A warning appears in the final 5 minutes; any interaction (mouse, keyboard) resets the timer.

---

## 4. Admin Guide

Admins have full access to every feature. Use this role for workshop owners and IT leads.

### 4.1 Dashboard

The admin dashboard summarises jobs in progress, upcoming appointments, outstanding invoices, low-stock items, and recent activity. Each tile links to its detailed view.

### 4.2 Users

**Admin → Users** lists every account in the workspace.

- **Create user** — add a new staff member or manager directly without an invite code.
- **Change role** — promote or demote between staff, manager, and admin.
- **Disable / enable** — block sign-in without deleting history.
- **View detail** — see the user's activity, assigned jobs, and trusted devices.

### 4.3 Clients

**Admin → Clients** manages client companies. Each client can have one or more linked user accounts and is the parent of jobs, appointments, and invoices.

### 4.4 Signup Codes

**Admin → Signup Codes** controls who can create accounts.

1. Click **Generate code**. Name the code (e.g. "Spring hire batch") and optionally set a max number of uses and an expiry date.
2. Share the code with the intended recipient.
3. Toggle **Active** off to immediately revoke any code.

Codes apply to public sign-ups only — admin-created users skip the code requirement.

### 4.5 Settings

**Admin → Settings** is organised into tabs:

- **General** — workshop name, logo, login screen image, currency, time zone.
- **Branding** — primary color and theme tokens; changes apply live across the app.
- **Features** — toggle Appointments, Reports, Client Portal, and Goals modules on or off.
- **Email** — configure the from-address and contact email used in notifications.
- **Data** — destructive actions: Factory Reset, Setup Demo Users, seed data.

### 4.6 Activity Logs

**Admin → Activity Logs** is an immutable audit trail of important events (sign-ins, role changes, deletions, settings updates). Filter by user, action, or date range. Export to CSV.

### 4.7 Issue Reports

**Admin → Issue Reports** collects bug reports submitted by users via the **Report Issue** link. Each report includes the user, page, browser info, and message.

### 4.8 Access Review

**Admin → Access Review** lists users by role with their last sign-in date so you can periodically remove dormant access.

### 4.9 Deploy Guide

**Admin → Deploy Guide** is the technical handbook for spinning up a new Workshop Buddy instance (Supabase project, migrations, edge functions, secrets).

---

## 5. Manager Guide

Managers run the workshop floor.

### 5.1 Dashboard

Operational KPIs: open jobs by status, today's appointments, overdue invoices, and recent activity.

### 5.2 Jobs

**Manager → Jobs** lists every job. Use filters for status, priority, assigned staff, and client.

- **New Job** — create a job with title, description, client, priority, due date, and assigned staff.
- **Click a row** to open the job detail page (timeline, comments, attachments, parts used, status updates).
- **Bulk status change** — select multiple jobs and update status from the toolbar.

### 5.3 Appointments

**Manager → Appointments** is the list view. **Manager → Calendar** is the drag-and-drop scheduling view.

- Drag a job onto a calendar slot to schedule it.
- Drag an appointment to reschedule.
- Click an appointment to view details, change attendees, or cancel.

### 5.4 Inventory

**Manager → Inventory** tracks parts and consumables.

- **Add item** — name, SKU, quantity, unit, low-stock threshold, cost.
- **Adjust stock** — increment or decrement with a reason note (auto-logged).
- **Low-stock alerts** appear on the dashboard and as in-app notifications.

### 5.5 Invoices

**Manager → Invoices** lists all invoices. Drafts are auto-created when a job is marked complete.

- **New Invoice** — pick a client, add line items, set tax, choose a due date.
- **Send** — generates a public Stripe-compatible payment URL.
- **Mark paid / partially paid** — record payments manually if collected outside Stripe.
- **PDF** — download a branded invoice PDF.

### 5.6 Staff

**Manager → Staff** lists staff members and lets you view each one's workload and recent activity.

---

## 6. Staff Guide

Staff focus on the work assigned to them.

### 6.1 Dashboard

Shows jobs assigned to you, today's schedule, and any low-stock items relevant to your jobs.

### 6.2 My Jobs

**Staff → My Jobs** is your job queue. Click a job to:

- Update status (Not Started → In Progress → On Hold → Completed).
- Add comments and attachments.
- Log parts used from inventory (deducts stock automatically).
- Log time worked.

### 6.3 Kanban

**Staff → Kanban** shows your jobs as cards across status columns. Drag a card to a new column to change its status — fastest way to update during a busy shift.

### 6.4 Schedule

**Staff → Schedule** shows your upcoming appointments in day, week, or list view. Click an appointment for details.

### 6.5 Inventory

**Staff → Inventory** is read-only. Use it to check stock levels before starting a job.

---

## 7. Client Guide

The client portal is a self-service window for your customers.

### 7.1 Dashboard

Summary of your open jobs, upcoming appointments, and outstanding invoices.

### 7.2 My Jobs

**Client → My Jobs** lists every job the workshop is doing for you. Click a job to view progress, photos, comments from the team, and parts used.

### 7.3 My Appointments

**Client → Appointments** shows confirmed appointments and lets you book a new 30-minute slot from available windows. Cancel or reschedule from the same screen.

### 7.4 My Invoices

**Client → Invoices** lists all your invoices.

- **Pay** — opens a secure Stripe payment page.
- **Download PDF** — for your records.
- **History** — past invoices remain visible after payment.

---

## 8. Core Workflows

### 8.1 Job lifecycle {roles: admin,manager,staff}

```text
Create job (Manager)
    ↓ assign staff and due date
Staff begins work (Staff)
    ↓ status: In Progress
Log parts and time (Staff)
    ↓ inventory deducts automatically
Mark complete (Staff or Manager)
    ↓ draft invoice auto-created
Send invoice (Manager)
    ↓ Stripe link emailed to client
Client pays (Client)
    ↓ status: Paid
```

### 8.2 Appointment scheduling {roles: admin,manager}

- **Manual scheduling** — drag a job from the side panel onto a calendar slot.
- **Fixed appointments** — create directly from the calendar (no job required), e.g. a consultation.
- **Client self-booking** — clients pick from 30-minute slots you've made available.

### 8.3 Invoice lifecycle {roles: admin,manager}

Draft → Sent → Viewed → Paid (or Overdue). Each transition is logged. You can resend, void, or refund from the invoice detail page.

### 8.4 Your invoices {roles: client}

When work on your job is finished, you'll receive an invoice by email. Open it from **Invoices** in the sidebar to view the breakdown, pay securely online, or download a PDF receipt once it's marked paid.

### 8.5 Inventory adjustments {roles: admin,manager,staff}

Every stock change records who, when, and why. Reports show consumption per job and per period.

---

## 9. Notifications

Workshop Buddy delivers notifications through three channels:

- **In-app bell** — every signed-in user. Click the bell to read, mark as read, or jump to the source.
- **Web push** — opt in from **Profile → Notifications** to receive browser/mobile push even when the app is closed. Requires permission on first opt-in.
- **Email** — sent for key events such as account confirmation, password reset, invoice sent, and issue report acknowledgements.

Push and email can be disabled per user.

---

## 10. Security & Account

### 10.1 Profile

**Profile** lets you change your name, email, phone, address, and avatar. Email changes require confirmation.

### 10.2 Password

Change your password from **Profile → Security**. You will be signed out of all other sessions.

### 10.3 Multi-factor authentication

See section 2.4. From **Profile → Security** you can:

- Disable MFA (not recommended).
- Regenerate backup codes (invalidates any previous codes).
- Revoke a single trusted device or **Revoke all devices**.

Rate limits prevent abuse: backup-code generation is capped at 3/hour, trusted-device actions at 5/hour, and 5 failed recovery attempts triggers a 15-minute lockout.

### 10.4 Report an issue

Every role has a **Report Issue** link in the sidebar. Describe what you were doing, what went wrong, and what you expected. Reports go straight to your admin (and the platform team).

---

## 11. FAQ & Troubleshooting

**My currency still shows dollars after I changed it.**
Refresh the page. The new currency applies to invoices, jobs, and reports automatically.

**MFA keeps prompting me even after I selected "Trust this device for 30 days".**
Your browser may be blocking cookies for the site, or you may be in a private/incognito window. Sign in on a non-private window and retry the trust action.

**I'm not receiving push notifications.**
Check **Profile → Notifications** is toggled on, and that your browser hasn't blocked notifications for the site (browser settings → site permissions).

**I can't create an account — "Invalid invite code".**
The code may be expired, fully used, or deactivated. Ask your admin for a new one.

**A page shows "Feature unavailable".**
The feature is currently disabled by your admin in **Admin → Settings → Features**.

**Session expired suddenly.**
For security the app signs you out after 30 minutes without activity. A warning appears 5 minutes before timeout.

**I lost my MFA device and my backup codes.**
Contact your admin. They can reset MFA on your account from **Admin → Users**.

---

## 12. Glossary

- **Admin** — top-level role with full access to settings, users, and security.
- **Manager** — runs operations; cannot manage workspace settings or users.
- **Staff** — works on assigned jobs only.
- **Client** — external customer with portal access to their own jobs and invoices.
- **Job** — a unit of work, with status, assigned staff, parts, time, and comments.
- **Appointment** — a scheduled calendar slot, optionally linked to a job.
- **Invoice** — billing document, can be Draft, Sent, Viewed, Paid, Overdue, Void.
- **Invite code** — token required for public sign-up; managed by admins.
- **Trusted device** — a browser you've marked to skip MFA for 30 days.
- **Backup codes** — one-time recovery codes for MFA, generated 10 at a time.
- **Broadcast** — workspace-wide banner notice from your admin or the platform.
- **Factory reset** — destructive admin action that wipes all operational data.

---

*Workshop Buddy — last updated June 2026.*
