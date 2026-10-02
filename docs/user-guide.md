# Shoplane User Guide

A complete reference for Admins, Managers, Staff and Clients: every page, every button and every step of a project's life.

---

## 1. Welcome

Shoplane is a workshop management platform that takes every project from reception to shipping (quotes, team tasks, parts, quality check, handover and invoicing) in one shared workspace. Every account belongs to one of four roles, each with its own home page and menu:

- **Admin** — full control of the workspace: users, teams and access, clients, settings, reports, billing and security. Admins hold every permission.
- **Manager** — runs day-to-day operations: projects, quotes, quality check, inventory, shipping, invoicing and staff. Managers hold every permission but can't change workspace settings or users.
- **Staff** — works on tasks for their teams and hands work on to the next team. Depending on their teams they may also run reception, inventory, shipping, billing or reports.
- **Client** — follows their projects, accepts or declines quotes, books appointments, chooses collection or delivery and pays invoices through a self-service portal.

Shoplane uses your workshop's own words. A machine repair shop sees **Machines**, serial numbers and running hours; a garage sees **Vehicles**, registrations and mileage; a fleet workshop sees **Fleet**; a marine or plant workshop sees **Equipment** and engine hours. This guide calls them all **assets**.

Your workshop chooses which parts of Shoplane it uses. If a page in this guide isn't in your menu, that part may be switched off for your workshop, or your role or teams may not include it.

The guide is organised so you can jump straight to your role, or read across roles to understand how work flows through the workshop. Section 8 follows a project from start to finish.

---

## 2. Getting Started

### 2.1 Signing up

Most people never sign up themselves: an admin adds them and they receive an email (see 2.2). If your workshop gave you an **invite code** instead:

1. Open the **Sign in** page and choose **Create an account**.
2. Choose the **Account type** your code is for: **Client** or **Staff**.
3. Enter your name (clients also enter their **Company name**), your **Work email**, a password, the password again, and the **Invitation code**.
4. Click **Create account**. You'll get an email with a confirmation link. It can take a minute; check your spam folder. **Resend email** sends it again.
5. Open the link, then sign in.

If the code is wrong, expired, used up or for the other account type, the page tells you. Ask your workshop for a new one.

### 2.2 Your first sign-in after an invite

When an admin adds you, you get an email with a link to set your password.

1. Open the link in the email.
2. Choose a password. The strength meter shows how strong it is; use at least 8 characters with upper and lower case, a number and ideally a symbol.
3. Type it again and save. Then sign in with your email and new password.

If the link has expired, ask your admin to use **Resend invite** (staff) or **Send sign-in link** (clients), or use **Forgot password?** on the sign-in page.

### 2.3 Signing in

1. Go to your workshop's Shoplane address and enter the email your workshop invited you with, and your password. A warning shows if Caps Lock is on.
2. If you use two-factor sign-in, enter the 6-digit code from your authenticator app. Tick **Trust this browser for 30 days** to skip the code on a computer only you use. Don't tick it on a shared computer.
3. Lost your phone? Choose **Use a backup code** and enter one of your one-time backup codes.
4. You land on your role's home page: **Today** (admins and managers), **My day** (staff) or **Your orders** (clients).

**Sign in as someone else** on the code step goes back to the email and password form.

### 2.4 Forgot password

Click **Forgot password?** on the sign-in page, enter your email, and open the link sent to your inbox. Choose a new password (at least 8 characters) and confirm it. Then sign in.

### 2.5 Two-factor sign-in (MFA)

Two-factor sign-in protects your account with a code from your phone as well as your password. It's **required for admins and managers**; everyone else can turn it on, and a banner reminds you until you do.

1. Open **Profile** and find **Two-Factor Authentication**.
2. Turn it on and scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy), or type the secret shown under it.
3. Enter the 6-digit code from the app to confirm.
4. **Save your backup codes.** Each one signs you in once if you lose your phone. Copy or download them and keep them somewhere safe; you won't see them again.

You can create new backup codes or revoke trusted browsers at any time from **Profile** (see 10.3).

---

## 3. Navigating the App

Every signed-in page shares the same layout.

### 3.1 The header

Along the top of every page:

- **Breadcrumbs** — where you are, with links back. **Home** always returns to your home page.
- **Search** — find projects by ID or title, invoices, requests or pages. Press **Ctrl K** (or **Cmd K** on a Mac) from anywhere.
- **Session timer** — appears when you're about to be signed out for inactivity (see 3.6).
- **Ask** — the assistant, when your workshop has it (see 3.4).
- **?** — help for the page you're on (see 3.3).
- **Notification bell** — your unread notifications (see 9).

### 3.2 The menu

- **Sidebar (left)** — your menu, grouped into sections such as Main, People, Admin and Help. The button at the top left of the header opens and closes it. Numbers beside items show what's waiting, for example requests at reception, overdue invoices, low stock or projects ready to ship.
- **On a phone** — the menu moves to a tab bar along the bottom with your main pages. **More** opens the rest.
- **Your name (sidebar footer)** — opens **Profile**, **Appearance** (Light, Dark or Match device) and **Sign out**.
- **Help** — **User Guide** (this guide, with a PDF version) and **Report Issue**.

### 3.3 Page help

Pages such as Today, Projects, a project, Reception and Invoices have a **?** in the header. It explains what the page is for, where it sits in a project's life and what you can do there, with a link to the full section of this guide. Press **?** on your keyboard to open it. A dot on the button means there's help you haven't read yet.

### 3.4 Ask (the assistant)

When your workshop has the assistant switched on, **Ask** in the header opens a chat. Ask questions in plain words, for example:

- "Where is project EDL-202609-004 up to?"
- "Which invoices are overdue?"
- "What's booked this week?" or "Which stock is running low?"
- "How do I hand a task over?"

It answers from your workshop's records and this guide, with links to the pages it mentions. It only sees what you can see, it can't change anything, and conversations aren't stored. **New chat** clears the conversation. If it can't help a client, it drafts a message to the workshop, and **Open in project chat** puts it in the project's messages, ready for the client to check and press Send. AI answers can be wrong, so check anything important on the page itself.

There are limits on how many questions each person can ask per day and the workshop per month; the assistant tells you if you reach one.

### 3.5 Banners

- **Broadcasts** — notices from your admin or from Shoplane appear at the top of the page. Close one with the X.
- **Two-factor reminder** — shows until you turn on two-factor sign-in, with **Set up 2FA**.
- **Offline** — if your connection drops, a banner says changes won't save until you reconnect, and a message confirms when you're back.

### 3.6 Sessions

For security, you're signed out after **30 minutes without activity**. A warning with a countdown appears in the last minutes: **Stay Logged In** keeps you in, **Log Out** signs you out now. Any mouse or keyboard activity resets the timer. A Goals screen left open on a wall display (see 5.8) counts as active.

---

## 4. Admin Guide

Admins have full access to every feature. Use this role for workshop owners and whoever looks after the system.

### 4.1 Today

**Today** is the admin and manager home page: everything that needs attention, with the button that deals with each.

- **Needs attention** — what's stuck, each with a link: overdue invoices, finished projects not yet invoiced, draft invoices to send, projects waiting for quality check, quotes the client hasn't answered, low stock, people who haven't accepted their invite, and a reminder if your own two-factor sign-in is off. When it's empty, nothing needs you.
- **Figures** — open projects, projects in review, invoices awaiting payment, appointments today and open project hours.
- **Projects in progress**, **Today's appointments**, **Team load** (who has how much open work) and **Revenue trend** (paid revenue for the last 6 months), each linking to its full page.
- **New** — start a **Project** (opens Reception's intake form), an **Appointment**, an **Invoice** or a **Client**.
- **Customise** — choose which cards you see and their order. Only you see your layout; **Reset to default** puts it back. Some cards are required and can't be hidden.
- **Refresh** — reloads the figures.

New admins also see a setup checklist on Today. It can be brought back from **Settings → General → Onboarding**.

### 4.2 Users

**Users** lists every account in the workspace: admins, managers, staff and clients. Filter by role with the tabs, or search by name or email. Each person shows a status: **Active**, **Invite sent**, **Not invited** or **Deactivated**.

- **New user** — enter their full name, email, role (Admin, Manager, Staff or Client) and optionally phone. They're emailed an invite to set their password. No invite code is needed.
- **Change role** — pick a new role from their row.
- **Resend invite** — sends the set-your-password email again, for example if it expired.
- **Delete user** — removes the account permanently. If they have projects or other records, deleting fails; deactivate them instead so their history stays.
- **Open a person** — see their profile, projects, invoices, appointments, hours logged and total billed, and **deactivate** or reactivate them. A deactivated person can't sign in.

### 4.3 Teams and access

**Teams and access** is where you organise people and decide what they can do.

- **Teams** — click **New team** and name it, for example Machining, Electrical, Fabrication, Quality, Inventory, Shipping or Management. Add people with **Add a person** and choose a **Lead**. Tasks go to a team first, then to a person in it, so a colleague can pick up work when someone is away. **Delete team** removes its permissions from its members and leaves its tasks unassigned; people and tasks aren't deleted.
- **What a team can do** — tick the permissions every member gets. Leave them all unticked for a workshop team that only works on the tasks it's given. The permissions are:
  - **Reception** — log machines as they arrive and handle client requests.
  - **Project planning** — split projects into team tasks, assign people and request parts.
  - **Quality check** — check finished work and release it to shipping.
  - **Inventory** — stock, parts requests, suppliers and purchase orders.
  - **Approve purchases** — approve purchase orders. Managers can approve up to the limit set in Settings.
  - **Shipping** — tell clients items are ready, record collections and courier shipments.
  - **Reports and costs** — reports, project profit and loss, and labour rates.
  - **Billing** — create, send and confirm invoices, the same as a manager.
- **Edit access** for one person — tick extra permissions for just them. Permissions they already get from a team show ticked and greyed out.
- **Hourly cost** — each person's labour cost per hour, used for project profit and loss and team reports. People without a rate show no labour cost. Hourly costs are private: only admins and people with Reports and costs see them.

Admins always hold every permission. Clients never hold any.

### 4.4 Clients

**Clients** lists the companies you work for. Each client has a portal login where they follow their projects, accept quotes, book appointments and pay invoices. Filter by **Portal on** or **Portal off**, or search.

**To invite a new client:**

1. Open **Clients** and click **Add client**.
2. Enter the company name and the email address they'll sign in with. Contact person, phone and address are optional. In a garage or marine workshop, where customers are usually people, you enter the **Customer name** instead, with **Company** optional.
3. Click **Add client**. They're emailed a link to set their password and sign in. No invite code is needed.

If the email doesn't arrive, open the **⋯** menu on their row and choose **Send sign-in link**. The same menu has:

- **Edit details** — company name, contact person, phone and address.
- **Turn portal off** — blocks their sign-in but keeps their projects, invoices and history. **Turn portal on** lets them back in.
- **Delete client** — only possible when they have no projects or invoices; otherwise turn their portal off.

A walk-in or phone customer who doesn't need the portal doesn't have to be added here: Reception can log their machine with just their name, phone and email (see 5.9).

### 4.5 Signup Codes

**Signup Codes** lets people create their own account with a code, instead of being added from Users or Clients.

1. Click **New code**. Use the generated code or type your own (at least 4 characters).
2. Optionally add a **Label** (for example "Acme Inc. – November intake"), and choose the **Role** the code creates: Client, Staff or Manager (admins can also issue Admin codes).
3. Set **Max uses** (blank for unlimited) and an optional **Expiry date** and time.
4. Share the code. **Copy code** puts it on your clipboard.

Each code shows its uses and status: **Active**, **Disabled**, **Expired** or **Used up**. **Toggle active** pauses a code instantly; **Delete code** removes it for good. Codes only apply when people sign up themselves; anyone added from Users or Clients doesn't need one.

### 4.6 Settings

**Settings** is organised into sections. Changes are saved with **Save**; a bar warns you if you have unsaved changes, with **Discard** to undo them.

- **General** — workshop name, **Type of workshop** (Industrial machine repair, Garage, Service fleet, or Marine & plant service; it sets the wording and the reception form, for example serial numbers and hours or registrations and mileage), contact email, phone and address. These appear on invoices, PDFs, emails and the client portal. **Onboarding** brings back the admin setup checklist on Today.
- **Billing**:
  - **Default Tax Rate (%)** for new invoices.
  - **Project ID prefix** — 2 to 6 letters or numbers. EDL gives project IDs like EDL-202609-001 (prefix, year and month, then a number).
  - **Managers can approve purchases up to** — purchase orders above this amount need an admin.
  - **Overhead on project costs (%)** — added to materials, labour and shipping in profit and loss, to cover rent, power and tools.
  - **Currency** and **Enabled invoice currencies** — your base currency, plus the others staff can pick on an invoice.
  - **Monthly Revenue Goal** — the target shown on Goals. Once set it's locked for that month, so progress stays honest; set the next one when the month starts. Past goals are listed below.
- **Notifications** — which events create in-app notifications: **Project status changes** (client and staff), **New appointments** (admin, when a client books) and **Low inventory alerts** (admin, when stock reaches its minimum).
- **Branding** — your **Workshop Logo** (square, 512×512 px PNG recommended), a **Login Page Image** for the sign-in page, and **Brand Colors** (primary and accent). Colours preview live and apply to everyone once saved. If a colour is too light for white text, buttons use a darker shade so they stay readable. **Reset to default** restores Shoplane's colours.
- **Email** — turn email notifications on or off, the **From Email Address** your emails come from, and the **Platform Support Email** that receives issue reports.
- **Integrations** — connect QuickBooks Online, Xero or any other finance system by webhook, when accounting sync is part of your plan. Sent invoices go there, and payments recorded there mark invoices paid in Shoplane. Choose the product or account and tax codes invoices post to, where payments go, who numbers invoices (**Keep Shoplane's numbers** or let the other system number them) and who emails them. **Test connection** checks it works, the **Sync log** shows every invoice sent with **Retry** for any that failed, and **Disconnect** stops syncing.
- **Data**:
  - **Create Backup** — downloads all workshop data (projects, requests, quotes, tasks, time, stock, purchasing, shipping, invoices, teams and access, and settings) as a file to keep somewhere safe. Up to 5 backups an hour.
  - **Restore from Backup** — replaces current data with a backup file. Type RESTORE to confirm. It's all or nothing: if the file doesn't fit this workshop, nothing changes.
  - **Delete All Data** — removes all projects, stock and billing data, keeping user accounts, teams and settings.
  - **Factory Reset** — wipes everything except your own admin account. Type RESET to confirm.
  - Take a backup before using either of the last two; they can't be undone. Demo and testing tools appear here only where your workshop has them.

### 4.7 Reports {roles: admin,manager,staff}

**Reports** needs the **Reports and costs** permission. Admins and managers have it. It has three tabs:

- **Profit and loss** — every project, with what was charged against what it cost. Pick the **Received from** dates; filter by **Projects** (All, Still open, Finished, Cancelled) and **Outcome** (Profit, Loss, At risk, On track, Not priced); **Group by** client, stage, month received or person; and choose the **Columns**. The columns include:
  - **Charged** — accepted quotes, less discounts. **Quoted, not accepted**, **Invoiced** and **Paid** sit alongside.
  - **Materials** — parts issued, less returns, at cost. **Parts still needed** shows what's requested but not yet issued.
  - **Labour** — hours × each person's hourly cost. **Estimated hours** and **Hours** compare plan with reality.
  - **Shipping**, **Overhead** (your Settings percentage), **Total cost**, **Profit** and **Margin**.
  - **Forecast profit** — profit once the parts still needed are used.
  - Loss-making projects are highlighted. **Save report** keeps the view (dates, filters, grouping and columns) for everyone with Reports access, and **CSV** downloads it.
- **Team** — hours, work value, handoffs and labour cost per person for any period.
- **Trends** — revenue, bookings and projects by status, month by month, each with a CSV download.

### 4.8 Activity Logs, Issue Reports and Access Review

- **Activity Logs** — a permanent record of important events: sign-ins, role changes, creations, updates and deletions. Filter by area and by type of change. An **Unusual activity** alert appears when something looks out of the ordinary, such as many deletions; **Dismiss alert** once you've checked it.
- **Issue Reports** — problems people sent with **Report Issue**, with who sent them, the page they were on and their browser. Switch between **Open** and **Resolved**, and mark each one resolved when it's dealt with.
- **Access Review** — every user with their role, status and last sign-in, marked **Active**, **Stale** (not signed in for a long time) or **Inactive**. **Deactivate**, **Activate** or **Remove role** from each row, and **Export CSV** to keep a record. Do this review every quarter and keep the export.

### 4.9 Import and export

**Import and export** (in the Admin menu, for admins and managers) brings your existing records into Shoplane from spreadsheets, and gives you a copy of what's there.

There's a section for each kind of data: **Clients** (called Customers in a garage), **Stock**, and your **Machines**, **Vehicles**, **Fleet** or **Equipment**. Each section has:

- **Sample file** — a CSV with the columns for your type of workshop and two example rows. Garages get registration, mileage and MOT due; machine shops get serial number and running hours; fleets also get fleet number.
- **Export** — what's already in Shoplane, in the same columns, so you can edit and re-import, or keep a copy.
- **Upload CSV** — choose your file. Shoplane matches your column names to its own (for example "Reg No" to Registration, "Qty" to Quantity), shows which columns it will ignore, and checks every row before anything is saved: a preview, how many rows are ready, and each problem by line. Dates can be written 2027-03-14 or 14/03/2027.
- **Import** — saves the rows that are ready, then shows how many were imported, skipped and not imported, with **Download results** listing each line.

Good to know:

- Import clients first, then assets: an asset's **Owner email** links it to that client. Leave it empty for a walk-in owner and give their name instead.
- Imported clients get a portal login but **aren't emailed**. Invite them when you're ready with **Send sign-in link** on the Clients page.
- Rows already in Shoplane (same email, same SKU or item name, same registration or serial) are skipped, never changed. Running the same file twice is safe.
- Stock suppliers are matched by name, or added. An asset row can add a service reminder (Service, Service due, Service every months) and, for vehicles, a yearly MOT reminder from MOT due.
- Save spreadsheets as **CSV (comma separated)**. Up to 2,000 rows a file.

---

## 5. Manager Guide

Managers run the workshop floor. They hold every permission, but can't change workspace settings or users. Admins see everything in this section too.

### 5.1 Today

The same home page as admins (see 4.1): **Needs attention** with what's stuck, open projects by stage, today's appointments, team load, revenue, and the **New** menu to start a project, appointment, invoice or client. **Customise** chooses your cards.

### 5.2 Projects

**Projects** lists every project with its permanent ID, for example EDL-202609-001. Filter by stage with the tabs (Evaluating, Quote sent, Approved, In progress, Quality check, Ready to ship, Shipped, Cancelled), search by ID, title or client, and open a row to see the project page. **Log a machine** starts a new project at Reception.

The project page is the one place for everything about a project:

- **Header** — the project's ID, title, stage and priority, with **Edit** and **Create invoice**.
- **Stage tracker** — where it is in its life, from Received to Shipped.
- **Next step panel** — the button that moves it forward at each stage (see 5.3 and 5.4).
- **Details** — **Status**, **Priority**, **Project lead**, **Client**, **Due Date**, and hours **Estimated** against **Logged**, with a bar showing hours used against the estimate.
- **Intake** — what came in, make and model, serial number, the reported problem, what came with it and its **Condition on arrival**, with the arrival photos the client can see.
- **Quotes and changes**, **Tasks**, **Parts**, **Files**, **Conversation** and **Activity**, each described below.

Things to know:

- Every project starts at **Reception**. **New → Project** on Today, a day on the calendar, and **Log as a project** on an appointment all open the same intake form, filled in with what's already known. A project made from an appointment stays linked to it.
- **Edit** changes the title, description, estimated hours, project lead, client, due date and priority. The **Project lead** is the person the client deals with; give out the work itself as tasks.
- The **Status** menu can only move a project back a stage or cancel it, with a reason that's saved as a team note. Move forward with the buttons in the next step panel, so nothing skips its quote, quality check or handover.
- **Close project** ends a project the client doesn't go ahead with. It keeps its ID and history, and your reason is kept as a team note. A cancelled project can be reopened at Received.
- **Files** — upload drawings, photos and documents. Each file is **Team only** unless you mark it **Shared** with the client; files the client uploads show as **From client**.
- **Conversation** — two tabs. **Team notes** are only seen by your team, never the client: record findings, decisions and progress there. **Client messages** go to the client, who's notified. Notes written on tasks also appear in Team notes, marked with the task.
- **Activity** — the full timeline: received, lead changes, handoffs, rework, parts requested and issued, quotes and change requests, quality check, the client being told it's ready, their collection or delivery choice, and anything handed over before payment.

### 5.3 Quotes and change requests

- From a project in **Evaluation**, click **New quote**. Add lines (work or part, quantity and price), choose the currency, and optionally a discount (percentage or fixed, before tax, with a reason), a **Valid until** date and **Notes for the client**. Evaluation itself is free.
- Save it as a draft, check it, then send it. The client accepts or declines in their portal. Accepting moves the project to **Approved**.
- **Share link** — for a customer without a portal account (a walk-in or phone customer), share the sent quote by secure link. **Email it** to their address, or **Copy a link** to send by WhatsApp or text. They open it, see the lines and total, type their name and press **Approve** or **Decline**; no account needed. You're notified straight away, the project moves on, and the activity shows who decided by link. The link works until the quote's valid-until date (or 30 days), can only be used once, and making a new one stops the old one.
- If the client tells you their decision by phone or email, use **Record acceptance** or **Record decline** so the project moves on. **Withdraw** takes back a quote you no longer stand by.
- If the client agreed without a written quote, **Approve without a quote** moves the project straight to Approved.
- If the work changes after it has started, add a **Change request**: say **Why it's needed**, add the lines and any **Extra days needed**. An admin signs it off (**Sign off and send**, or **Don't approve**), then the client accepts or declines it, and the agreed total updates.
- A quote or change request shows its status: **Draft**, **Waiting for admin sign-off**, **Waiting for client**, **Accepted**, **Declined** or **Withdrawn**. **Agreed with client** shows the running total of everything accepted.

### 5.4 Planning, teams and quality check

- On an approved project, click **Add task** for each piece of work, for example Machining, then Electrical. Give it a title, details, a **Team**, optionally a **Person**, a **Due** date and **Estimated hours**. Leave the person empty for anyone in the team to take.
- A task goes to the team first. The team lead or a member clicks **Take it**, or a manager assigns someone.
- The person clicks **Start**, then **Hand off** when it's done: what was done, hours spent and the next step. Handoffs show in the project activity and on Goals, and tell whoever is next.
- **Log time** records hours on a task for any day, with a note. Hours must be between 0 and 24 a day.
- Each task's menu has **Edit task**, **Assign to someone in the team**, **Reopen task** and **Delete task**.
- Give tasks estimated hours where you can: Goals uses them to share the quote's value between the tasks.
- When every task is handed off, click **Start quality check**. Someone with the Quality check permission (usually the Management team) checks the finished work:
  - **Pass quality check** — the project becomes **Ready to ship**, shipping is told, and a draft invoice is made (see 5.7).
  - **Send back for rework** — tick the tasks that need rework and say **What needs fixing**. Each ticked task gets a rework task for the same team and person, marked **Rework**.

### 5.5 Inventory

**Inventory** has its own portal with five sections:

- **Parts requests** — parts asked for by project teams. For each line, **Issue** it from stock (choose the stock item and quantity; stock goes down and the cost is added to the project), **Order** it (adds it to a draft purchase order for a supplier) or **Cancel** it. Lines show **To issue**, **On order**, **Issued** or **Cancelled**.
- **Stock** — your items, with quantity, unit, cost, minimum level and location. **Add item** with name, SKU or part number, category, unit (pcs, m, kg, L), unit cost, opening stock, **Reorder when at or below**, usual order quantity, supplier, shelf location and notes. Use **Adjust stock** to change quantities so every change is recorded: **Add stock** (a delivery without a purchase order), **Remove stock** (damaged, lost or used in-house) or **Set the exact count** (stocktake), each with a reason. Filter by **Low stock** to see what needs reordering. Costs are averaged as new stock arrives.
- **Purchases** — purchase orders to suppliers. **New purchase order**: choose the supplier and currency, add lines (stock items, or new and non-stock items) with quantities and unit costs, an expected delivery date and notes, and attach the **Supplier quote** so the approver can check the price. Then **Submit for approval**. Orders up to the manager limit in Settings can be approved by someone with Approve purchases; larger ones need an admin. The approver can **Approve** or **Reject** with a reason. Once approved, **Mark as ordered**, then **Receive goods**: enter what actually arrived, stock goes up, and parts ordered for a project are ready to issue. Orders show **Draft**, **Waiting for approval**, **Approved, not ordered**, **Rejected**, **On order**, **Received** or **Cancelled**.
- **Suppliers** — the companies you buy from: name, contact person, phone, email, address and notes such as account number, lead times and minimum order.
- **Usage by project** — parts issued to each project and their cost, for any period.

### 5.6 Shipping

**Shipping** lists projects that have passed quality check, until they're collected or dispatched, in four tabs: **Ready**, **Waiting for client**, **Arranged** and **Shipped**.

1. **Tell the client** it's ready, with an optional message (for example your opening hours). They get an email and an in-app notice.
2. The client chooses **Collect it** (and who's collecting) or **Deliver it** (and the address) in their portal.
3. **Hand over** records how it left:
   - **Collection** — who collected it, an optional ID check and phone number, and the vehicle and registration.
   - **Delivery** — the courier, tracking number and an optional tracking link (starting with https://), plus the shipping cost.
   - Add any documents; the client can see them on their project. The project becomes **Shipped**.

Each card shows whether the project is **paid**, **invoiced but unpaid**, **not invoiced yet**, or a walk-in to bill directly. Handing over something that isn't paid for asks **Why is it leaving before payment?**; the reason is kept as a team note and in the project activity. The client's collection or delivery date also appears in the calendar and follows any change they make.

### 5.7 Invoices

**Invoices** lists all invoices with tabs for **Overdue**, **Drafts**, **Sent** and **Paid**, and search.

- **Automatic drafts** — when a project passes its quality check, a draft invoice is made from the accepted quote and approved changes, and everyone who handles billing is told. Check it and send it.
- **Create invoice** on a project also starts from the accepted quote. It warns if the lines differ from the agreed price, and if the project already has an invoice. If the project has no accepted quote, add the lines yourself.
- **New invoice** starts one from scratch: choose the client, due date, tax rate, currency and notes, and add line items (description, quantity, unit price). A **Live Preview** updates as you type. For a currency other than your base currency, the exchange rate is filled in automatically, or enter it yourself.
- **Discount** — none, a percentage or a fixed amount, with a reason.
- **Payment Link** — paste any payment page address (for example a Stripe payment link). The client sees a **Pay Now** button once the invoice is sent. Without a link, the **Payment Instructions** (for example your bank details) are shown instead.
- **Send to client** — marks it sent and notifies the client in the app, by email, and by push if they've turned it on. **Resend to client** sends it again.
- **Remind client** — sends a reminder with the total.
- **Mark payment received** records payment. If the client has already pressed **I've paid**, it shows **Confirm payment received** instead.
- **PDF** downloads the invoice; each PDF is saved as a version you can download again later.
- **Mark as** changes the status from the list. Admins can **Delete** an invoice; this can't be undone.
- Statuses: **Draft** (the client can't see it), **Sent**, **Paid**, **Overdue** (past its due date and unpaid) and **Cancelled**.
- With an accounting system connected (4.6), sent invoices and payments sync automatically. Each invoice shows where it stands in the connected system, with **Sync now** if it didn't get there.
- **Today** shows drafts waiting to be sent and finished projects with no invoice.

### 5.8 Staff and Goals

- **Staff** — everyone on the team with their role and teams, and who leads them. Filter by **Everyone**, **Technicians** or **Managers**. Open a person to see their projects and work.
- **Goals** — the month's work delivered against the monthly goal, plus each person's **Hours**, **Handoffs** and **Work value** (each finished task's share of its project's agreed quote). Choose another **Month** to look back. Costs stay off this screen because everyone can see it; people with Reports and costs see a link to the full team report. **Full screen** turns it into a wall display for the workshop floor that refreshes itself and keeps the session alive while it's open.

### 5.9 Reception

**Reception** is where every project starts. It has two tabs.

- **Log a machine** — record a machine as it arrives:
  1. Choose a portal **Client**, or enter a walk-in or phone customer's **Name**, **Phone** and optional **Email**.
  2. **Been in before?** Pick it from the client's assets shown under the client, or type its registration, serial or fleet number in the find box. Picking it fills in its details and adds this project to its service history.
  3. Describe **What's come in**, the **Make and model**, its **Registration** or **Serial number** (whichever your workshop uses), the current **reading** (running hours or mileage), the **Reported problem** in the customer's words, what it was **Received with**, and its **Condition on arrival**.
  4. **Add photos**. Arrival photos are locked once saved and the client can see them. Leave **Save to the customer's machines** (or vehicles, or equipment) ticked so a first-time item is added to the asset register with this project as its first visit.
  5. Choose **What the customer wants**: **Evaluation** (assess it first, free), **Quote** (price it before work starts) or **Approved job** (work can begin). Set the **Priority** (Low, Normal, High, Urgent) and an optional **Wanted by** date.
  6. Save. The project is created with its permanent ID and its page opens. If it's linked to an asset, the project's **Intake** card has a **Service history** link.
- **Client requests** — repair and quote requests sent from the client portal, with their priority and preferred date. **Receive item** when the machine arrives and it becomes a project. **Decline** with a reason; the client sees your reason in the portal and is notified.
- **Received this week** lists the latest machines with their stage, so the front desk can answer "where's my machine?" without leaving the page.

Staff need the Reception permission to use this page.

**Job cards and labels.** On any project page, **Print** gives you two choices. Each opens in a new tab with the print dialog ready.

- **Job card (A4)** is a sheet that travels with the machine. It has:
  - your logo and the project ID, with a QR code
  - the customer, the item's details and its reading
  - the reported problem, what it came with and its condition on arrival
  - the tasks, with boxes to tick and spaces for hours and initials
  - blank lines for parts used and technician notes
  - quality check and customer signature lines
- **QR label (62 mm)** is a sticker for the machine or its tag. It shows the QR code, the project ID, what it is, the customer and the date it came in. Pick **62 × 40 mm** for a continuous 62 mm roll, or **62 × 29 mm** for Brother DK-11209 labels. In the print dialog, choose your label printer, set the paper to the same size and set the margins to none.

Scanning a project's code with a phone opens that project in Shoplane, for anyone on the team who is signed in.

### 5.10 Appointments and calendar

- **Appointments** — every booking, in **Upcoming**, **Today** and **Past** tabs. **New appointment**: title, client, date, time, type, duration in minutes and notes. Change an appointment's status with **Mark as** (for example Confirmed, Completed or Cancelled), or **Edit** or **Delete** it. **Export to calendar** downloads the bookings for Outlook, Google or Apple Calendar.
- **An appointment's page** — its details and notes. **Log as a project** turns it into a project at Reception, linked to the appointment.
- **Calendar** — projects by due date and appointments, by **Month** or **Week**. Show projects, appointments or both, and filter by status and priority. Figures at the top show projects due this month, appointments and overdue projects. Click a day to see its events, or **Create Job** to start a project due that day. Drag a project to another day to change its due date.
- Collections and deliveries appear on the calendar by themselves once the client has chosen, and follow any change they make.

### 5.11 Assets and service reminders

The asset register is every machine, vehicle or piece of equipment your customers bring in. It's called **Machines**, **Vehicles**, **Fleet** or **Equipment** in the menu, depending on your type of workshop. Each asset keeps its own service history and its service reminders. Admins, managers and anyone with Reception or Project planning can add and change assets; everyone on the team can look them up.

- **The list** — every asset with its owner, current reading and next service, and a **Due soon** or **Overdue** badge. Filter by **Due soon** or **Overdue**, or search by name, registration, serial, fleet number or owner. **Add** a new one with its owner, type, name, make and model, registration and VIN (vehicles) or serial number (everything else), current reading (hours, miles or km) and notes.
- **An asset's page**:
  - **Details** — make and model, identifiers, the latest reading and when it was taken, the owner and notes.
  - **Service reminders** — each service or inspection that comes round again, with when it's next due, how often it repeats and when it was last done.
  - **Service history** — every project this asset came in for, newest first, with the reading at the time.
  - **New project** opens Reception already linked to the asset. The **⋯** menu has **Edit details**, **Update reading** and **Archive** (hides it from lists, keeps its history).
- **Adding a reminder** — click **Add reminder**, then pick a common one (for example MOT, Annual service, PUWER inspection, LOLER thorough examination or Service every 500 hours) or type your own. Set how often it repeats (every so many months, every so many hours or miles, or both) and when it's next due (a date, a reading, or both: whichever comes first). Leave both repeat boxes empty for a one-off.
- **When it comes due** — a reminder is **Due soon** within 14 days of its date, or within 10% of its reading; then **Overdue**. Each morning Shoplane tells the owner (if they have a portal login) and your admins, managers and reception that it's coming due. Today's **Needs attention** shows the services due, and the menu item shows a count.
- **Mark done** — record the date and reading, and the project it was done on. The next one is set from the interval, so the cycle carries on by itself.
- **Readings** — every project logged with a reading updates the asset's reading. You can also use **Update reading** at any time.
- **Print label** on an asset's page prints a QR sticker with its registration, fleet or serial number, its name and owner. Stick it on the machine: scanning it opens its service history, so whoever is standing next to it can see what was done last and what's due.

---

## 6. Staff Guide

Staff focus on the tasks given to them and their teams.

### 6.1 My day

**My day** is your home page, built to use on a phone:

- **Task in hand** — the task you're working on, with **Open project** and **Hand off**.
- **My other tasks** — the rest of your tasks, marked **Urgent**, **High priority**, **Late** or **Rework**, with **Start**.
- **Waiting in your teams** — tasks given to your teams that nobody has taken yet. **Take it** makes one yours.
- **Projects you lead** — projects where you're the person the client deals with.
- **Today's bookings** — your appointments today.

### 6.2 My projects

**My projects** lists projects where you or your teams have tasks. **Mine** shows only those; **All projects** shows the whole workshop. Open a project to:

- **Start** your task, then **Hand off** to the next team with what you did, the hours and the next step.
- **Take it** for a task waiting in your team.
- **Log time** against a task for any day.
- **Request parts** from inventory: pick from stock or describe a part stores doesn't keep, add how many, when it's needed by and a note for stores. You're told when they're ready. **Take back unused parts** returns spares to stock and takes them off the project's cost.
- Add **Team notes**, which only staff see, and reply to the client in **Client messages**.
- Add photos and files, shared with the client or kept to the team.

### 6.3 Team portals {roles: admin,manager,staff}

Depending on your teams you may also see:

- **Reception** — log incoming machines and handle client requests (5.9).
- **Inventory** — issue parts, manage stock and handle purchases (5.5).
- **Shipping** — tell clients and record handovers (5.6).
- **Invoices** — with the Billing permission (5.7).
- **Reports** — with Reports and costs (4.7).
- **Quality check** — passing or sending back finished work on a project (5.4).
- **Machines, Vehicles, Fleet or Equipment** — look up a customer's asset, its service history and what's due (5.11). People with Reception or Project planning can add and edit them.

If a link is missing, ask an admin to add you to the right team in **Teams and access**.

### 6.4 Schedule

**Schedule** shows your appointments in **Upcoming** and **Past** tabs.

---

## 7. Client Guide

The client portal is your window into the work the workshop is doing for you.

### 7.1 Your orders

**Your orders** is your home page:

- **Quotes waiting for your decision**, with **See the lines and details**, accept, and **Decline** (with an optional reason, for example price or timing). **Keep quote** goes back without declining.
- **In progress** — your projects and where each one is.
- **Coming up** — your next appointments.
- Invoices to pay, with links to **All projects**, **All invoices** and **All bookings**.
- **New request** asks the workshop for a quote or repair (see 7.3).

If your profile is missing details, a reminder offers **Update profile**.

### 7.2 My projects

**Projects** is everything you have with the workshop in one list: quotes waiting for your decision at the top (**Review and decide**), then requests the workshop hasn't received yet, then your projects. Each shows its state: **Waiting for the workshop**, **Declined by the workshop**, **In the workshop**, **Ready**, **Collected or delivered** or **Cancelled**. **Cancel request** withdraws a request the workshop hasn't received yet.

Open a project to see:

- Where it is: Received, Evaluation, Quote, In progress, Quality check, Ready, Shipped.
- The photos taken when your machine arrived (**Condition on arrival**).
- **Quotes and changes** to **accept or decline**, with the total agreed so far. Telling the workshop why you declined helps them send a better option.
- **Messages** — the conversation with the workshop. Questions go straight to the team. You can add files too.
- **Files** the workshop has shared with you.
- **Invoices** for the project.
- When it's ready, **Choose collection or delivery** (see 7.5).

### 7.3 Requests

Press **New request** on Your orders or Projects to ask the workshop for work:

1. Choose **Request a quote** (a price before work begins) or **Request a repair** (ask them to take on the work).
2. Give it a short **Title** and the **Details**, a **Priority** and an optional **Preferred date**.
3. Send it. It shows at the top of Projects until the workshop's reception receives it; then it becomes a project in the same list. If the workshop declines it, you see their reason.

### 7.4 Appointments and invoices

- **Appointments** — your bookings. **Book Appointment**: give it a title, choose the type (**Consultation**, **Repair** or **Inspection**) and a date, then pick one of the **Available Time Slots**. **Export** adds your bookings to your own calendar. Collections and deliveries appear here by themselves once you've chosen one on your project.
- **Invoices** — **To pay** and **Paid**. Open an invoice to see its lines and download a PDF. **Pay now** opens the workshop's payment page when there is one; otherwise the payment instructions are shown. After paying another way, press **I've paid**: the invoice shows **Payment submitted — awaiting confirmation** until the workshop confirms it.

### 7.5 Collection or delivery

When your project passes its final checks, the workshop tells you it's ready. On the project, choose:

- **Collect it** — you or someone you send picks it up from the workshop. Say who's collecting.
- **Deliver it** — the workshop sends it by courier to your address. Enter the delivery address.

Once it's on its way you can see who collected it, or the courier and a **Track it** link.

### 7.6 Rating your project

After a project is finished, **Rate this project** asks for a star rating and optional feedback. It goes straight to the workshop and helps them improve.

### 7.7 Your machines and vehicles

When the workshop has the asset register switched on, your menu has **Machines**, **Vehicles** or **Equipment** (depending on the workshop). It lists everything of yours they look after, with what's coming due. Open one to see:

- its details and latest reading;
- its **service reminders**, with when each is next due (you're notified in the portal when one is coming up);
- its **service history**: every job the workshop has done on it.

**Request a service** sends the workshop a request about that machine or vehicle, already filled in. It shows at the top of Projects until reception receives it.

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
Ready to ship   Draft invoice made; shipping tells the client, who picks collection or delivery
   ↓
Shipped         Handover recorded
```

A project can be cancelled at any stage with a reason, and reopened at Received. Every step is recorded in the project's activity, with who did it and when.

### 8.2 Your project {roles: client}

You'll be told when a quote is ready, when work starts, when it passes quality check and when it's ready. Accept the quote, follow progress, message the workshop and choose collection or delivery from the project page. Your invoice arrives by email and in the portal.

### 8.3 Parts and purchasing {roles: admin,manager,staff}

A team requests parts on the project → inventory issues them from stock, or orders them on a purchase order if they're out of stock → the order is approved within the limits in Settings → marked ordered → received into stock → issued to the project. Every movement records who, when and for which project, and its cost counts towards the project's profit and loss. Unused parts can be taken back into stock.

### 8.4 Appointment scheduling {roles: admin,manager}

- **Fixed appointments** — create them from Appointments or the calendar, for example a consultation or a site survey.
- **New project on a day** — **Create Job** on the calendar opens Reception's intake with that due date.
- **Rescheduling** — drag a project to another day on the calendar to change its due date.
- **Collections and deliveries** — created from the client's choice in Shipping, never booked by hand.
- **Client self-booking** — clients pick from available time slots in their portal; you're notified when they book.

### 8.5 Invoice lifecycle {roles: admin,manager}

Draft (made at quality-check pass, from a project, or by hand) → Sent → Paid, or Overdue if it passes its due date unpaid. A client can press I've paid, which you then confirm. Each change is logged. Shipping can see the status, so nothing leaves unpaid without a recorded reason.

### 8.6 Your invoices {roles: client}

When work on your project is finished you'll receive an invoice by email and in the portal. Open it from **Invoices** to view the breakdown, pay online, or download a PDF. If you pay by bank transfer, press **I've paid** so the workshop knows to check.

### 8.7 Quotes and change requests {roles: admin,manager,staff}

Draft → (change requests only: admin sign-off) → Waiting for client → Accepted or Declined. Staff can record a decision the client gives by phone. A withdrawn quote stays on the project's record. The agreed total is the sum of everything accepted, less discounts, and it's what profit and loss and the draft invoice use.

### 8.8 New people {roles: admin}

- **Staff and managers** — add them in **Users** (they're emailed an invite), then put them in teams and set their hourly cost in **Teams and access**.
- **Clients** — add them in **Clients**; they're emailed a link to set their password.
- **Self sign-up** — or share a **Signup Code** and let them create their own account.
- When someone leaves, deactivate them from their page in Users rather than deleting them, so their history stays.

---

## 9. Notifications

Shoplane tells people about what matters to them through three channels:

- **In-app** — the bell in the header (clients see **Updates** on their home page). Click one to open what it's about, or **Mark all read**.
- **Email** — for key events such as invites, password resets, quotes, a project being ready, invoices and issue reports.
- **Push** — alerts on your phone or computer even when Shoplane is closed. Turn them on from **Profile → Push Notifications** on each device; your browser asks for permission the first time.

Typical notifications include a new task for you or your team, a task handed to you, parts ready, a quote accepted or declined, a change request to sign off, a project passing quality check, a project ready to ship, a draft invoice to send, a client message, a new client request, a new booking, low stock, and an invoice sent or overdue. Admins choose which status, booking and stock notifications are sent in **Settings → Notifications**.

---

## 10. Security & Account

### 10.1 Profile

**Profile** shows your account at a glance (role, member since, last sign-in and two-factor status) and lets you change your name, phone, address and picture (click your picture to change it). Clients can also set their company and contact person. Your email can't be changed here; ask your admin.

### 10.2 Password

Change your password from **Profile → Security**: enter your current password and the new one twice. Use at least 8 characters with upper and lower case and a number.

### 10.3 Two-factor sign-in

See 2.5. From **Profile** you can also:

- **Regenerate backup codes** — makes a new set and cancels the old ones. There's a short wait between regenerations.
- **Trusted devices** — see the browsers that skip the code, and revoke one or **Revoke all**. You'll need a code on each of them next time.
- **Turn two-factor off** — not recommended, and admins and managers must keep it on.

Rate limits prevent abuse: backup-code generation is capped at 3 an hour, trusted-device actions at 5 an hour, and 5 failed recovery attempts trigger a 15-minute lockout.

### 10.4 Report an issue

Every role has **Report Issue** in the Help menu. Give it a **Title**, choose a **Severity** (Low, Medium or High), describe what you were doing, what you expected and what happened, and say which page you were on. Your admin is notified straight away in the app and by email. High-severity reports are dealt with first, usually within a working day.

### 10.5 How your data is protected

- Each workshop has its own separate database. Nobody outside your workshop can see your data.
- Everyone sees only what their role, teams and permissions allow, and clients only ever see their own projects, quotes and invoices. This is enforced by the database itself, not just the screens.
- Everything is encrypted in transit and at rest, and important actions are recorded in the activity log.
- Accounts are by invitation only, and two-factor sign-in is required for admins and managers.

---

## 11. FAQ & Troubleshooting

**How do I invite a new client?**
Open **Clients**, click **Add client**, and enter their company name and email. They're emailed a link to set their password. See 4.4. {roles: admin}

**How do I add a new member of staff?**
Open **Users**, click **New user**, and choose the Staff or Manager role. They're emailed an invite. Then add them to their teams and set their hourly cost in **Teams and access**. {roles: admin}

**Someone didn't get their invite email.**
Ask them to check spam, then use **Resend invite** in Users (staff) or **Send sign-in link** in Clients. {roles: admin}

**How do I move a project forward?**
Use the button in the project's next step panel, for example New quote, Start quality check or Pass quality check. The Status menu only moves projects back or cancels them. {roles: admin,manager,staff}

**A walk-in customer wants to approve a quote. They don't have an account.**
Open the sent quote on the project and click **Share link**. Email it or copy the link and send it by WhatsApp or text; they approve it from their phone. See 5.3. {roles: admin,manager,staff}

**A client accepted a quote by phone. How do I record it?**
Open the quote on the project and click **Record acceptance**. {roles: admin,manager}

**How do I bring in our existing customers, stock and equipment?**
Use **Import and export** in the Admin menu: download the sample file, fill it in or match your columns to it, and upload it. See 4.9. {roles: admin,manager}

**How do I set up a service reminder?**
Open the machine or vehicle from the asset register (Machines, Vehicles, Fleet or Equipment in the menu), click **Add reminder**, and pick a common service or type your own. See 5.11. {roles: admin,manager,staff}

**Why does my menu say Vehicles (or Machines)?**
Shoplane uses the words for your type of workshop. An admin can change the type in **Settings → General**. {roles: admin,manager}

**When is my next service due?**
Open **Machines** or **Vehicles** in your menu and choose the item; its service reminders show the next due date. You can request the service from the same page. {roles: client}

**My currency still shows dollars after I changed it.**
Refresh the page. The new currency applies to invoices, projects and reports automatically. {roles: admin,manager}

**I can't see Reception, Inventory, Shipping or Reports.**
These follow your teams. Ask an admin to add you to the right team in **Teams and access**. {roles: staff}

**A project shows "Not priced" in profit and loss.**
It has no accepted quote yet, so there's nothing to set its costs against. {roles: admin,manager}

**Labour cost shows nothing for someone.**
They have no hourly cost. Set it in **Teams and access**. {roles: admin}

**A purchase order is stuck at "Waiting for approval".**
It's above the managers' limit in Settings, so an admin needs to approve it. {roles: admin,manager,staff}

**Where's the quote or invoice I'm waiting for?**
Quotes waiting for you are at the top of **Your orders** and **Projects**. Sent invoices are in **Invoices**. Drafts aren't shown until the workshop sends them. {roles: client}

**I've paid, but the invoice still says I owe it.**
Press **I've paid** on the invoice. It shows "Payment submitted — awaiting confirmation" until the workshop confirms they've received it. {roles: client}

**Two-factor keeps asking for a code even after I chose "Trust this browser for 30 days".**
Your browser may be blocking cookies for the site, or you may be in a private window. Sign in in a normal window and tick it again.

**I'm not receiving push notifications.**
Check **Profile → Push Notifications** is on for this device, and that your browser hasn't blocked notifications for the site in its settings.

**I can't create an account: "Invalid invite code".**
The code may be expired, used up, disabled or for the other account type. Ask your workshop for a new one.

**A page shows "Feature unavailable".**
That part of Shoplane isn't switched on for your workshop. Ask your admin, who can ask Shoplane to add it.

**I was signed out suddenly.**
For security you're signed out after 30 minutes without activity. A warning appears a few minutes before.

**I lost my phone and my backup codes.**
Contact your admin, who can reset two-factor sign-in on your account.

**The assistant says it doesn't know.**
It only answers from your workshop's records and this guide, so try asking another way or check the guide section it suggests. Clients can send their question to the workshop with the draft it offers.

---

## 12. Glossary

- **Admin** — top-level role with full access to settings, users, teams and security. {roles: admin,manager}
- **Manager** — runs operations; cannot manage workspace settings or users. {roles: admin,manager}
- **Staff** — works on tasks for their teams. {roles: admin,manager,staff}
- **Client** — a customer with portal access to their own projects, quotes and invoices.
- **Project** — one piece of work for a client, from reception to shipping, with a permanent ID such as EDL-202609-001.
- **Project lead** — the person the client deals with on a project. {roles: admin,manager,staff}
- **Intake** — what reception recorded when the machine arrived: details, condition and photos.
- **Quote** — the price for a project, which the client accepts or declines. A **change request** adjusts it after work has started.
- **Agreed total** — everything the client has accepted on a project, less discounts.
- **Team** — a department such as Machining or Shipping. Tasks go to a team first, then to a person. {roles: admin,manager,staff}
- **Task** — one piece of work on a project for a team or person. {roles: admin,manager,staff}
- **Handoff** — passing a finished task to the next team with a note. {roles: admin,manager,staff}
- **Rework** — a task created when work is sent back from quality check. {roles: admin,manager,staff}
- **Quality check** — the sign-off a project needs before it can ship. {roles: admin,manager,staff}
- **Permission** — something a person may do beyond their role, such as Reception or Approve purchases, given by their teams or individually. {roles: admin,manager,staff}
- **Work value** — a finished task's share of its project's agreed quote, used on Goals. {roles: admin,manager,staff}
- **Overhead %** — a share added to project costs in profit and loss to cover rent, power and tools. {roles: admin,manager}
- **Parts request** — parts a team asks stores for on a project. {roles: admin,manager,staff}
- **Purchase order** — an order to a supplier, approved before it's placed. {roles: admin,manager,staff}
- **Appointment** — a scheduled calendar slot, optionally linked to a project.
- **Asset** — a customer's machine, vehicle or piece of equipment, with its service history and reminders. Called Machines, Vehicles, Fleet or Equipment in the menu.
- **Service reminder** — a service or inspection that repeats every so many months or hours or miles; Shoplane tells the owner and the workshop when it's coming due.
- **Reading** — running hours or mileage, recorded at each visit and used for reminders by hours or miles.
- **Invoice** — the bill for work, which can be Draft, Sent, Paid, Overdue or Cancelled.
- **Payment link** — a web page where the client pays online, shown as Pay Now.
- **Invite code** — the code needed to sign up without being added by an admin. {roles: admin,manager}
- **Trusted device** — a browser you've marked to skip the two-factor code for 30 days.
- **Backup codes** — one-time codes for signing in without your phone, generated 10 at a time.
- **Broadcast** — a workspace-wide notice from your admin or from Shoplane.
- **Assistant** — the Ask chat, which answers from your workshop's records and this guide.
- **Factory reset** — the admin action that wipes all workshop data except the admin's own account. {roles: admin}

---

*Shoplane — last updated 2 October 2026.*
