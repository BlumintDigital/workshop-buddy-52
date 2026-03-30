

## Plan: Generate Sample Data + Add Delete All Data Option

### What we're building

1. **An edge function `seed-data`** that generates realistic sample data across all tables (jobs, appointments, inventory, invoices, notifications, job_tasks, job_updates, inventory_transactions). It will use the service role key to insert data, and will be callable only by admins.

2. **An edge function `delete-data`** that deletes all user-generated data from all business tables (preserving auth users, profiles, user_roles, and workshop_settings). Admin-only.

3. **A new "Data Management" tab in AdminSettings** with two buttons:
   - "Generate Sample Data" -- calls the seed-data function
   - "Delete All Data" -- shows a confirmation dialog, then calls delete-data function

### Technical Details

#### Edge Function: `supabase/functions/seed-data/index.ts`
- Validates caller is admin (same pattern as `create-client`)
- Uses service role client to bypass RLS
- Fetches existing user IDs from profiles/user_roles to assign realistic foreign keys (client_id, assigned_staff_id)
- Inserts sample data in dependency order:
  1. **inventory_items** -- 10 items (brake pads, oil filters, spark plugs, etc.)
  2. **jobs** -- 8 jobs with varied statuses, priorities, linked to real client/staff users
  3. **job_tasks** -- 2-3 tasks per job
  4. **job_updates** -- 1-2 updates per job
  5. **appointments** -- 6 appointments with varied dates/statuses
  6. **invoices** -- 4 invoices linked to completed jobs
  7. **invoice_items** -- 2-3 line items per invoice
  8. **inventory_transactions** -- transactions for used inventory
  9. **notifications** -- a few sample notifications
- Returns count of inserted records

#### Edge Function: `supabase/functions/delete-data/index.ts`
- Validates caller is admin
- Uses service role client to delete from all business tables in reverse dependency order:
  1. inventory_transactions
  2. invoice_items
  3. invoices
  4. job_updates
  5. job_tasks
  6. jobs
  7. appointments
  8. inventory_items
  9. notifications
- Does NOT delete: profiles, user_roles, workshop_settings, auth.users
- Returns count of deleted records per table

#### UI Changes: `src/pages/admin/AdminSettings.tsx`
- Add a new "Data" tab to the existing Tabs component
- Contains two cards:
  - **Generate Sample Data**: description + button, shows loading state, calls `supabase.functions.invoke("seed-data")`
  - **Delete All Data**: description + destructive button, opens AlertDialog for confirmation, calls `supabase.functions.invoke("delete-data")`
- Both show toast with results on success/error

### Files to create/modify
| File | Action |
|------|--------|
| `supabase/functions/seed-data/index.ts` | Create |
| `supabase/functions/delete-data/index.ts` | Create |
| `src/pages/admin/AdminSettings.tsx` | Add "Data" tab with seed/delete buttons |

