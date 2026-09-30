# Setting up a new Shoplane customer

This guide is for someone who has just joined and has never seen Shoplane before.
You don't need to be technical: setting up a customer is a form and a button.
Read it once from top to bottom before your first customer.

---

## 1. What Shoplane is, in one page

**Shoplane** is software for engineering workshops: projects, tasks, quotes,
invoices, stock, shipping, appointments and a client portal. It's a brand of
**Blumint Digital Limited**.

Every customer (a "workshop") gets **their own separate copy** of Shoplane:

| Piece | What it is | Where it lives |
|---|---|---|
| Website | What the workshop's staff and clients use, e.g. `https://ieq.shoplane.uk` | Vercel, one project per customer |
| Database and sign-in | All the workshop's data, their user accounts, and server functions | Supabase, one project per customer, in London |
| Email | Invites, password resets, notifications, sent from `noreply@shoplane.uk` | Resend, one sending key per customer |
| Code | One codebase shared by every customer | GitHub: `BlumintDigital/workshop-buddy-52` |

No customer can see another customer's data: they are in different databases.

**Shoplane Control** (`https://shoplane-control.vercel.app`) is our own
back-office. It sets up new customers, keeps track of them, sends them notices,
turns features on and off, and rolls out new versions. You'll do almost
everything from there.

---

## 2. Before your first customer

### Your access

Ask your manager for:

- A **Shoplane Control** account. You'll set up two-factor sign-in (an
  authenticator app such as Google Authenticator or 1Password) the first time
  you sign in. Save the backup codes it shows you somewhere safe.
- Access to the **DNS settings for `shoplane.uk`** (the domain is managed
  outside Vercel), or the name of whoever changes DNS records for us.

That's all you need for everyday work. You don't need Supabase, Vercel or
GitHub accounts to set up a customer.

### Connections (done once, by an admin)

Shoplane Control needs a key for each service it uses. These are pasted once on
the **Connections** page, and each has step-by-step instructions under its box:

| Service | What it's used for | Setting to check |
|---|---|---|
| Supabase | Creates each customer's database | "New customers go in": **Backup** |
| Vercel | Creates each customer's website | Team: **ukohaemmanuel's projects** |
| Resend | Creates each customer's email key | Sending domain: **shoplane.uk** |
| GitHub | Reads the Shoplane code (read-only) | Repository: `workshop-buddy-52` |

Each box shows **Connected** when its key works. If one says **Not working**,
follow the note in the box to create a new key and paste it in. Keys can never
be read back once saved, not even by admins; to change one, paste a new one.

---

## 3. Setting up a customer

Allow about 15 minutes, most of it waiting for DNS.

### Step 1: Gather the details

From the customer (or the salesperson), you need:

- **Workshop name** as they want it shown, e.g. *Acme Engineering Ltd*.
- **Web address**: a short name for `<name>.shoplane.uk`, e.g. `acme`. Lowercase
  letters, numbers and hyphens, starting with a letter. **It can't be changed
  later**, so confirm it with the customer.
- **Their admin**: the name and email of the person at the workshop who will
  manage Shoplane. They'll be the first user and can invite everyone else.
- **Which features they bought** (see step 2).

### Step 2: Fill in the New customer form

In Shoplane Control, click **New customer** and fill in:

1. Workshop name. The web address fills itself in; change it if needed.
2. Admin's name and email.
3. "Emails are sent from": leave it as `noreply@shoplane.uk`.
4. **Features**: switch on what the customer has bought.

   | Feature | Starts | Notes |
   |---|---|---|
   | Appointments and calendar | On | |
   | Client portal | On | Clients sign in to follow their work and pay invoices |
   | Reports | On | |
   | Project chat | On | |
   | Inventory | On | |
   | Shipping | On | Turn off for workshops where customers always collect |
   | Accounting sync | Off | QuickBooks/Xero; only for customers who've bought it |
   | Goals | Off | Floor-screen scoreboard; only for customers who asked for it |

   **Operator tools** (sample data, demo accounts, backup and restore) stay off
   for real customers. They're for demos.
5. Tick the box confirming this creates a paid database and website, then click
   **Set up customer**.

### Step 3: Watch it build

You'll see a list of steps ticking off: database, schema, server functions,
website, features, admin account. It usually takes **2 to 5 minutes**.

**Keep the page open** until it finishes: the page is what moves it along. If
you close it by accident, open the customer's setup from the Customers page and
it carries on where it stopped.

If a step fails, the page says what went wrong in plain words and offers
**Try again**. Most failures are a Connections key that has expired; fix it on
the Connections page, then try again. It never repeats steps that already
worked.

### Step 4: Point the web address at the website (DNS)

When the build finishes, the page shows a **Finish setting up** card with one
DNS record to add, for example:

| Type | Name / Host | Value / Points to |
|---|---|---|
| CNAME | `acme` | `188f98cdd13aecdd.vercel-dns-016.com` |

- **Copy the value from the card.** Vercel gives every customer their own
  target, so never reuse one from another customer or from this guide.
- Add the record in the DNS settings for `shoplane.uk` (or send it to whoever
  manages DNS). Don't change any other records.
- Back in Shoplane Control, click **Check the record**. New records can take a
  few minutes (occasionally up to an hour) to appear. Try again until it says
  **Working**.

### Step 5: Send the welcome email

Click **Send welcome email**. The admin receives a link to set their password.
The first time they sign in, Shoplane makes them set up two-factor sign-in with
an authenticator app; they can't use anything until they do. That's expected;
tell them in advance.

### Step 6: Hand over

Tell the customer's admin:

- Their address: `https://<name>.shoplane.uk`.
- To look for the welcome email (and check spam).
- That they invite their team from **Settings → Signup Codes** (invite codes)
  or **Users**.
- Where the user guide is: **Help** in the menu.

The customer now appears on the **Customers** page as **Live**.

---

## 4. Looking after customers

Open a customer from the **Customers** page. The tabs:

| Tab | Use it to |
|---|---|
| Overview | See health, key figures, and finish setup if it wasn't completed |
| Insights | Look at their work in progress, performance and stock |
| People | See their users, change roles, switch access off, create a super admin |
| Messages | Post a notice inside their Shoplane (e.g. planned maintenance) |
| Features | Switch features on or off. Changes apply the next time a page loads |
| Settings | Their workshop settings and version label |
| System | Technical details (database version, project reference) |
| Activity | What's been happening in their Shoplane |

**Status on the Customers page**

- **Live**: answering normally.
- **Not responding**: the last check got no proper answer. The card shows the
  reason. Click **Refresh** on Overview; if it persists, tell a developer.
- **Finishing setup**: DNS or the welcome email is still to do.

**Releases.** When developers finish a new version, they'll ask you to run a
release on the **Releases** page. It updates every customer's database and
server functions one by one, then tells you to merge (developers do the merge).
If one customer fails, the others still update; retry that one after it's fixed.

---

## 5. Removing a customer

Only when a manager asks, because it deletes the customer's data for good.

1. Ask a developer to take a final backup of their database.
2. In Supabase (Backup organisation), delete their project `shoplane-<name>`.
3. In Vercel, delete their project `shoplane-<name>` (this removes the domain).
4. In Resend, delete their API key `shoplane-<name>`.
5. Delete their `<name>` CNAME record from the `shoplane.uk` DNS.
6. Remove them from Shoplane Control (ask a developer; there is no button yet).

---

## 6. Rules that keep customers safe

- **Never share keys, passwords or backup codes** by email or chat. Keys go
  straight into the Connections page and nowhere else.
- **Never sign in to a customer's Shoplane as them.** If you need to see their
  system, use Shoplane Control, or ask their admin to invite you.
- **Accounts are created by invitation only.** Nobody can sign up to a
  workshop's Shoplane without an invite code from that workshop.
- **Admins and managers must use two-factor sign-in.** Staff can choose to.
- **A floor screen showing Goals** should be signed in with a staff account,
  not an admin's. Goals keeps the screen signed in while it's open.

---

## 7. For developers: what happens behind the button

Useful if a setup fails in a way the page can't explain.

The work is done by the `operations` edge function in the Shoplane Control
repository (`BlumintDigital/command-center-control`,
`supabase/functions/operations/`). Each step lives in `provision.ts`; the engine
(`engine.ts`) runs steps in order, saves progress in the `runs` table, and
resumes from the failed step on retry.

| Step | What it does |
|---|---|
| check | Reads the current code version from GitHub |
| project, project_ready | Creates the Supabase project `shoplane-<slug>` in the Backup organisation (eu-west-2) and waits for it |
| keys | Reads the new project's API keys |
| email_key | Creates a Resend key named `shoplane-<slug>` |
| auth | Sets sign-in: site URL, redirect URLs, email through Resend. (Sign-up stays on in Supabase; the database refuses any account without a valid invite code.) |
| schema | Loads the schema snapshot (`supabase-test/supabase/migrations/2026010100000*.sql`) |
| migrations | Applies every migration newer than the snapshot (`BASELINE_VERSION` in `scripts/test-db.mjs`) |
| settings, secrets | Workshop settings and edge function secrets (admin API key, site URL, Resend key, sender) |
| functions | Deploys every edge function in `supabase/functions/` |
| vercel_project, vercel_domain | Creates the Vercel project with its env vars, adds `<slug>.shoplane.uk`, and stores Vercel's CNAME target |
| vercel_deploy, vercel_ready | Builds the website from `main` and waits until it's ready |
| admin | Creates the customer's admin through their `admin-api` (`provision_account` first; invite-only sign-up) |
| features | Sets the chosen feature switches through `admin-api` |
| register | Adds the customer to Shoplane Control and clears the run's temporary secrets |

Things to know:

- **Don't replay the full migration history** on a new database; it fails
  partway. New databases always start from the schema snapshot.
- **Never run `supabase db push` or `supabase db reset`** against a customer.
  Database changes for existing customers go out through **Releases**, and a
  backup comes first.
- Feature switches live in each customer's `feature_flags` table. A new switch
  needs: the `feature_flags_key_check` constraint and a seed row (migration),
  `is_feature_enabled()`, restrictive "Feature gate" policies on its tables,
  gating in routes, navigation and pages, `VALID_KEYS` in `admin-api`, and the
  lists in Shoplane Control (`FEATURE_FLAG_META`, `FEATURE_KEYS`).
- Commits to either repository must be authored with an email linked to the
  Vercel account's GitHub login, or Vercel blocks the build.
