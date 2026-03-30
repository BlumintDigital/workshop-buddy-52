

## Multi-Feature Implementation Plan

### Database Changes (1 migration)

**Add `is_active` column to `profiles` table** for client portal activation:
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
```

No other schema changes needed -- existing tables cover all requirements.

---

### Feature 1: Client Appointment Booking with Date Picker and Availability Check

**Update `src/pages/client/ClientAppointments.tsx`**:
- Replace raw `<Input type="date">` / `<Input type="time">` with shadcn Calendar date picker (Popover + Calendar component with `pointer-events-auto`)
- Add time slot selector: generate 30-min slots (e.g. 09:00-17:00), query `appointments` table for the selected date to find conflicts, disable already-booked slots
- Availability check: on date selection, fetch all appointments for that date, grey out taken time slots
- Keep existing table listing below

---

### Feature 2: Real-time Kanban Board

**Update `src/pages/staff/StaffKanban.tsx`**:
- After initial fetch, subscribe to Supabase realtime channel on `jobs` table filtered by `assigned_staff_id = user.id`
- On `UPDATE` event: merge changed row into local state (update status/priority/etc.)
- On `INSERT`: add new card
- On `DELETE`: remove card
- Cleanup subscription on unmount
- Keeps existing drag-and-drop logic unchanged

---

### Feature 3: Admin Client Management Page

**Create `src/pages/admin/AdminCl