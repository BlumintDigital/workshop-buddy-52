# Align admin page-header action buttons on mobile

## Problem
On mobile, the action buttons on **Jobs (New Job)**, **Inventory (Add Item)**, and **Clients (Add Client)** don't sit the same way as **Appointments (New Appointment)** and **Invoices (New Invoice)**. The wrappers look similar in source, but small structural differences cause them to render differently inside the mobile header row.

Notable differences found:
- `AdminInventory.tsx` — `<Button>` is a direct child of `<Dialog>` (no `DialogTrigger asChild`), so the Dialog passes it through unwrapped and the button doesn't behave like a flex item the same way.
- `AdminJobs.tsx` — `<DialogTrigger asChild>` wraps the button but sits inside an extra `<Dialog>` element that participates in the parent flex row.
- `AdminClients.tsx` — same `<DialogTrigger asChild>` pattern inside an extra `<Dialog>`.
- `AdminAppointments.tsx` / `AdminInvoices.tsx` — button is wrapped in a plain `<div className="flex gap-2">` or a `<Link>`, which acts as a clean inline-block trigger in the flex row.

## Fix
Standardize the trigger wrapper across the three offenders so the button is a direct flex child of a `div`, matching the Appointments/Invoices pattern. Keep the existing parent header row (`flex flex-col sm:flex-row sm:items-center justify-between gap-4`) unchanged.

### Files to update (frontend only)

1. **`src/pages/admin/AdminJobs.tsx`** — wrap the `<Dialog>` trigger area so the rendered button sits in a `<div className="flex gap-2">` like Appointments:
   ```tsx
   <div className="flex gap-2">
     <Dialog open={open} onOpenChange={setOpen}>
       <DialogTrigger asChild>
         <Button onClick={() => fetchUsers()}>
           <Plus className="mr-2 h-4 w-4" />New Job
         </Button>
       </DialogTrigger>
       <DialogContent>…</DialogContent>
     </Dialog>
   </div>
   ```

2. **`src/pages/admin/AdminInventory.tsx`** — convert the bare `<Button>` to a proper `<DialogTrigger asChild>` and wrap the Dialog in a `<div className="flex gap-2">`:
   ```tsx
   <div className="flex gap-2">
     <Dialog open={open} onOpenChange={setOpen}>
       <DialogTrigger asChild>
         <Button><Plus className="mr-2 h-4 w-4" />Add Item</Button>
       </DialogTrigger>
       <DialogContent>…</DialogContent>
     </Dialog>
   </div>
   ```

3. **`src/pages/admin/AdminClients.tsx`** — wrap the existing Dialog in the same `<div className="flex gap-2">`.

No business logic, no data, no styling token changes — purely presentational wrapping so mobile alignment matches the Appointments/Invoices header pattern.

## Verification
Drive Playwright at viewport 390×844, restore the admin session, navigate to `/admin/jobs`, `/admin/inventory`, `/admin/clients`, `/admin/appointments`, `/admin/invoices`, and screenshot each header to confirm the trigger button sits in the same position and size across all five.
