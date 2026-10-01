# Shoplane User Guide

A complete reference for Admins, Managers, Staff, and Clients.

---

## 1. Welcome

Shoplane is a workshop management platform that takes every project from reception to shipping — quotes, team tasks, parts, quality check, handover and invoicing — in one shared workspace. Every account on the platform belongs to one of four roles, each with a tailored experience:

- **Admin** — full control of the workspace: users, teams and access, settings, reports, billing and security.
- **Manager** — runs day-to-day operations: projects, quotes, quality check, inventory, shipping, invoicing and staff.
- **Staff** — works on tasks for their teams, hands work on to the next team, and — depending on their teams — runs reception, inventory or shipping.
- **Client** — follows their projects, accepts quotes, chooses collection or delivery and pays invoices through a self-service portal.

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

- **Sidebar (left)** — primary navigation. Collapses to icons on smaller screens. The trigger in the header expands or collapses it. Links to Reception, Inventory, Shipping and Reports appear when your role or teams allow them.
- **Header (top)** — breadcrumbs, search, notification bell, and broadcast banner area.
- **Ask** — when your workshop has the assistant switched on, ask it questions in plain words: where a project is up to, which invoices are unpaid, what's on this week, or how to do something. It answers from your workshop's records and this guide, sees only what you can see, and can't change anything. If it can't help a client, it drafts a message to the workshop for them to check and send.
- **Notification bell** — shows unread in-app notifications. Click to view recent activity and mark them as read.
- **Broadcast banner** — system-wide notices from your administrator appear here. Use the X to dismiss.
- **Profile menu (sidebar footer)** — access your profile, security settings, and sign out.
- **Session timer** — for security, you are signed out after 30 minutes of inactivity. A warning appears in the final 5 minutes; any interaction (mouse, keyboard) resets the timer.

---

## 4. Admin Guide

Admins have full access to every feature. Use this role for workshop owners and IT leads.

### 4.1 Today

The admin **Today** page summarises projects by stage, requests waiting at reception, overdue invoices, low stock, projects ready to ship and recent activity. Each tile links to its detailed view.

### 4.2 Users

**Users** lists every account in the workspace.

- **Create user** — add a new staff member or manager directly without an invite code.
- **Change role** — promote or demote between staff, manager and admin.
- **Disable / enable** — block sign-in without deleting history.
- **View detail** — see the user's activity, assigned tasks and trusted devices.

### 4.3 Teams and access

**Teams and access** is where you organise people and decide what they can do.

- **Teams** — create departments such as Machining, Electrical, Quality, Inventory, Shipping or a Management team. Add people to each team and pick a team lead. Tasks are assigned to a team first, then to a person in it, so a colleague can pick up work when someone is away.
- **Team permissions** — tick what a team's members may do: Reception, Planning, Quality check, Inventory, Approve purchases, Shipping, Reports and costs, Billing. Everyone in the team gets them. Billing lets staff create, send and confirm invoices, the same as a manager.
- **Individual permissions** — give or take away a permission for one person, on top of their teams.
- **Labour rates** — set each person's hourly cost. It is used for project profit and loss and on the Goals page. People without a rate show no labour cost.

Admins always hold every permission. Clients never hold any.

### 4.4 Clients

**Clients** lists the companies you work for. Each client has a portal login where they follow their projects, accept quotes, book appointments and pay invoices.

**To invite a new client:**

1. Open **Clients** and click **Add client**.
2. Enter the company name and the email address they'll sign in with. Contact person, phone and address are optional.
3. Click **Add client**. They're emailed a link to set their password and sign in. No invite code is needed.

If the email doesn't arrive, open the **⋯** menu on their row and choose **Send sign-in link**. The same menu has **Edit details**, **Turn portal off** (blocks sign-in but keeps their history) and **Delete client** (only possible when they have no projects or invoices).

A walk-in or phone customer who doesn't need the portal doesn't have to be added here: Reception can log their machine with just their name, phone and email (see 5.9).

### 4.5 Signup Codes

**Signup Codes** controls who can create accounts.

1. Click **Generate code**. Name the code (e.g. "Spring hire batch") and optionally set a max number of uses and an expiry date.
2. Share the code with the intended recipient.
3. Toggle **Active** off to immediately revoke any code.

Codes apply to public sign-ups only — admin-created users skip the code requirement.

### 4.6 Settings

**Settings** is organised into tabs:

- **General** — workshop name, logo, login screen image, currency, time zone.
- **Billing** — tax and invoice terms, the **Project ID prefix** (EDL gives IDs like EDL-202609-001), the amount **managers can approve purchases up to**, the **overhead %** added to project costs in reports, and the monthly goal.
- **Branding** — primary colour and theme tokens; changes apply live across the app.
- **Features** — toggle Appointments, Reports, Client Portal and Goals on or off.
- **Email** — configure the from-address and contact email used in notifications.
- **Integrations** — connect QuickBooks Online, Xero or any other accounting system. Sent invoices go there, and payments recorded there mark invoices paid here. Choose the tax codes and products or accounts invoices post to, whether the other system numbers and emails invoices, and see the sync log. Each invoice shows where it stands in the connected system, with **Sync now** if it didn't get there. Setup steps for each system are in `docs/integrations.md`.
- **Data** — destructive actions: Factory Reset, Setup Demo Users, seed data.

### 4.7 Reports {roles: admin,manager,staff}

**Reports** needs the **Reports and costs** permission. Admins and managers have it.

- **Profit and loss** — every project, with what was charged (the accepted quote after discount) against materials at cost, labour at each person's hourly cost, shipping and overhead. Pick the dates, filter by stage or outcome (Profit, Loss, At risk, On track, Not priced), group by client, stage, outcome, month or person, and choose the columns. **Save report** keeps the view for everyone with Reports access, and **CSV** exports it. Loss-making projects are highlighted.
- **Team** — hours, tasks completed, handoffs and labour cost per person for any period.
- **Trends** — revenue, bookings and projects by status, month by month.

### 4.8 Activity Logs, Issue Reports and Access Review

- **Activity Logs** — an immutable audit trail of important events (sign-ins, role changes, deletions, settings updates). Filter and export to CSV.
- **Issue Reports** — bug reports submitted through **Report Issue**, with the user, page and browser details.
- **Access Review** — users by role with their last sign-in date, so you can remove dormant access.

---

## 5. Manager Guide

Managers run the workshop floor. They hold every permission, but can't change workspace settings or users.

### 5.1 Today

Open projects by stage, today's appointments, quotes waiting for the client, projects in quality check, overdue invoices and recent activity.

### 5.2 Projects

**Projects** lists every project with its permanent ID, for example EDL-202609-001. Filter by stage, search by ID, title or client, and open a row to see the project page. It is the one place for everything about a project: stage, intake details and photos, quotes and change requests, team tasks, parts, time, files, the conversation with the client, internal notes, shipping and activity.

- Every project starts at **Reception**. **New → Project** on Today, a day on the calendar, and **Log as a project** on an appointment all open the same intake form, filled in with what's already known. A project made from an appointment stays linked to it.
- The **Project lead** is the person the client deals with. Give out the work itself as tasks.
- The **Status** menu can only move a project back a stage or cancel it, with a reason that's saved as a team note. Move forward with the buttons in the stage panel, so nothing skips its quote, quality check or handover.

### 5.3 Quotes and change requests

- From a project in **Evaluation**, build a quote with line items and an optional discount (percent or fixed, before tax), then send it. Evaluation is free.
- The client accepts or declines in their portal. Accepting moves the project to **Approved**.
- If the work changes after it has started, add a **change request**. An admin signs it off, then the client accepts it, and the agreed total updates.

### 5.4 Planning, teams and quality check

- On an approved project, add **tasks** for each team (for example Machining, then Electrical). A task goes to the team first; the team lead or a member then takes it or gives it to a person.
- When a task is done, the person **hands it off** to the next team with a note. Handoffs show in the project activity and on the Goals page.
- Notes written on a task also appear in the project's **Team notes**, marked with the task.
- Give tasks **estimated hours** where you can: Goals uses them to share the quote's value between the tasks.
- When all the work is done the project moves to **Quality check**. Someone with the Quality check permission — usually the Management team — passes it, and it becomes **Ready to ship** and shipping is told. Or they send it back with a reason.

### 5.5 Inventory

**Inventory** has its own portal:

- **Stock** — items, quantities, low-stock levels and weighted cost.
- **Requests** — parts requested by project teams. The inventory team issues them to the project (stock goes down and the cost counts against the project) and records returns.
- **Purchases** — purchase orders to suppliers. Orders up to the manager limit in Settings can be approved by a manager; larger ones need an admin. Once approved, mark it ordered, then receive it to add the stock.
- **Suppliers** and **Usage** — supplier details, and parts used by project and period.

### 5.6 Shipping

**Shipping** lists projects that have passed quality check.

1. **Tell the client** it's ready. They get an email and an in-app notice.
2. The client chooses **collection** (and who's collecting) or **delivery** (and the address) in their portal.
3. Shipping records the handover — who collected it and the vehicle registration, or the carrier, tracking number and cost for a delivery. The project becomes **Shipped**.

Each card shows whether the project is paid, invoiced but unpaid, not invoiced yet, or a walk-in to bill directly. Handing over something that isn't paid for asks for a reason, which is kept as a team note and in the project activity. The client's collection or delivery date also appears in the calendar, and follows any change they make.

### 5.7 Invoices

**Invoices** lists all invoices.

- When a project passes its quality check, a **draft invoice** is made from the accepted quote and approved changes, and everyone who handles billing is told. Check it and send it.
- **Create invoice** on a project also starts from the accepted quote, warns if the lines differ from the agreed price, and warns if the project already has an invoice.
- **Today** shows drafts waiting to be sent and finished projects with no invoice.
- Apply any discount, send it and record payments. With an accounting system connected in Settings → Integrations, sent invoices and payments sync with it automatically.

### 5.8 Staff and Goals

**Staff** shows each person, their teams and who leads them. **Goals** shows the work delivered this month against the monthly goal, plus each person's hours, handoffs and **work value** (each finished task's share of its project's agreed quote). People with Reports and costs also see labour cost and a link to the full team report. **Show on a screen** turns it into a wall display that refreshes itself.

### 5.9 Reception

**Reception** is where every project starts. It has two tabs.

- **Log a machine** — record a machine as it arrives: choose a portal client or enter a walk-in or phone customer's name, phone and email, then what's come in, make and model, serial or asset number, the reported problem in the customer's words, what came with it and its condition on arrival. Add arrival photos the client can see. Choose how it came in: **Evaluation** (assess it first, free), **Quote** (price it before work starts) or **Approved job** (work can begin). Logging it creates the project with its permanent ID and opens the project page.
- **Client requests** — repair, evaluation and quote requests sent from the client portal. Receive one when the machine arrives and it becomes a project, or decline it with a reason.
- **Received this week** lists the latest machines with their stage, so the front desk can answer "where's my machine?" without leaving the page.

---

## 6. Staff Guide

Staff focus on the tasks given to them and their teams.

### 6.1 My day

Your open tasks, tasks waiting for your team, today's schedule and anything handed to you recently.

### 6.2 My projects

**My projects** lists projects where you or your team have tasks. On a project you can:

- Start and finish your task, then **hand it off** to the next team with a note.
- **Request parts** from inventory for the project.
- Log time worked.
- Add internal notes, which only staff see, and reply to the client in the conversation.
- Add photos and files.

### 6.3 Team portals {roles: admin,manager,staff}

Depending on your teams you may also see **Reception** (log incoming machines and client requests), **Inventory** (issue parts and handle purchases), **Shipping** (tell clients and record handovers), **Invoices** (with the Billing permission) or **Reports**. If a link is missing, ask an admin to add you to the right team in **Teams and access**.

### 6.4 Schedule

**Schedule** shows your upcoming appointments in day, week or list view.

---

## 7. Client Guide

The client portal is a self-service window for your customers.

### 7.1 Dashboard

Your open projects, quotes waiting for your decision, appointments and outstanding invoices.

### 7.2 My projects

**Projects** is everything you have with the workshop in one list: quotes waiting for your decision at the top, then requests the workshop hasn't received yet, then your projects. Open a project to see:

- Where it is: Received, Evaluation, Quote, In progress, Quality check, Ready, Shipped.
- The photos taken when your machine arrived.
- Quotes and change requests to **accept or decline**.
- The conversation with the workshop, where you can send messages and files.
- When it's ready, **Choose collection or delivery**.

### 7.3 Requests

Press **New request** on Projects (or your dashboard) to ask for a repair, an evaluation or a quote. It shows at the top of Projects until the workshop's reception receives it; then it becomes a project in the same list.

### 7.4 Appointments and invoices

**Appointments** shows confirmed appointments and lets you book a consultation, repair or inspection. Collections and deliveries appear there by themselves once you've chosen one on your project. **Invoices** lists your invoices to view, pay online or download as PDF.

---

## 8. Core Workflows

### 8.1 Project lifecycle {roles: admin,manager,staff}

```text
Received        Reception logs the machine, client, photos and condition
   ↓
Evaluation      Technicians assess the work (free)
   ↓
Quote           Quote sent; the client accepts or declines in the portal
   ↓
Approved        Tasks planned for each team
   ↓
In progress     Teams work and hand off; parts issued from inventory; time logged
   ↓
Quality check   The Management team passes it or sends it back
   ↓
Ready to ship   Shipping tells the client; the client picks collection or delivery
   ↓
Shipped         Handover recorded
```

Every step is recorded in the project's activity, with who did it and when.

### 8.2 Your project {roles: client}

You'll be told when a quote is ready, when work starts, when it passes quality check and when it's ready. Accept the quote, follow progress and choose collection or delivery from the project page.

### 8.3 Parts and purchasing {roles: admin,manager,staff}

A team requests parts → inventory issues them, or raises a purchase order if they're out of stock → the order is approved within the limits in Settings → received into stock → issued to the project. Every movement records who, when and for which project, and its cost counts towards the project's profit and loss.

### 8.4 Appointment scheduling {roles: admin,manager}

- **Manual scheduling** — drag a project onto a calendar slot.
- **Fixed appointments** — create directly from the calendar, e.g. a consultation.
- **New project on a day** — opens Reception's intake with that due date.
- **Collections and deliveries** — created from the client's choice in Shipping, never booked by hand.
- **Client self-booking** — clients pick from slots you've made available.

### 8.5 Invoice lifecycle {roles: admin,manager}

Draft (made at quality-check pass, or by hand) → Sent → Viewed → Paid (or Overdue). Each transition is logged. Shipping can see the status, so nothing leaves unpaid without a recorded reason.

### 8.6 Your invoices {roles: client}

When work on your project is finished you'll receive an invoice by email. Open it from **Invoices** to view the breakdown, pay securely online, or download a PDF.

---

## 9. Notifications

Shoplane delivers notifications through three channels:

- **In-app bell** — every signed-in user. Click the bell to read, mark as read, or jump to the source.
- **Web push** — opt in from **Profile → Notifications** to receive browser/mobile push even when the app is closed. Requires permission on first opt-in.
- **Email** — sent for key events such as account confirmation, password reset, quotes, a project being ready, invoices, and issue report acknowledgements.

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
Refresh the page. The new currency applies to invoices, projects and reports automatically. {roles: admin,manager}

**I can't see Reception, Inventory, Shipping or Reports.**
These follow your teams. Ask an admin to add you to the right team in **Teams and access**. {roles: staff}

**A project shows "Not priced" in profit and loss.**
It has no accepted quote yet, so there's nothing to set its costs against. {roles: admin,manager}

**MFA keeps prompting me even after I selected "Trust this device for 30 days".**
Your browser may be blocking cookies for the site, or you may be in a private/incognito window. Sign in on a non-private window and retry the trust action.

**I'm not receiving push notifications.**
Check **Profile → Notifications** is toggled on, and that your browser hasn't blocked notifications for the site (browser settings → site permissions).

**How do I invite a new client?**
Open **Clients**, click **Add client**, and enter their company name and email. They're emailed a link to set their password. See 4.4. {roles: admin}

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

- **Admin** — top-level role with full access to settings, users, teams and security. {roles: admin,manager}
- **Manager** — runs operations; cannot manage workspace settings or users. {roles: admin,manager}
- **Staff** — works on tasks for their teams. {roles: admin,manager,staff}
- **Client** — external customer with portal access to their own projects, quotes and invoices.
- **Project** — one piece of work for a client, from reception to shipping, with a permanent ID such as EDL-202609-001.
- **Quote** — the price for a project, which the client accepts or declines. A **change request** adjusts it after work has started.
- **Team** — a department such as Machining or Shipping. Tasks go to a team first, then to a person. {roles: admin,manager,staff}
- **Handoff** — passing a finished task to the next team with a note. {roles: admin,manager,staff}
- **Quality check** — the sign-off a project needs before it can ship. {roles: admin,manager,staff}
- **Permission** — something a person may do beyond their role, such as Reception or Approve purchases, given by their teams or individually. {roles: admin,manager,staff}
- **Overhead %** — a share added to project costs in profit and loss to cover rent, power and tools. {roles: admin,manager}
- **Appointment** — a scheduled calendar slot, optionally linked to a project.
- **Invoice** — billing document, can be Draft, Sent, Viewed, Paid, Overdue, Void.
- **Invite code** — token required for public sign-up; managed by admins. {roles: admin,manager}
- **Trusted device** — a browser you've marked to skip MFA for 30 days.
- **Backup codes** — one-time recovery codes for MFA, generated 10 at a time.
- **Broadcast** — workspace-wide banner notice from your admin or the platform.
- **Factory reset** — destructive admin action that wipes all operational data. {roles: admin}

---

*Shoplane — last updated 1 October 2026.*
