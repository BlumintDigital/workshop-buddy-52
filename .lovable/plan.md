

## Plan: Add Drag-and-Drop Job Rescheduling to Calendar

### What
Enable dragging job event pills from one calendar day cell to another to reschedule the job's `due_date` in Supabase. Only jobs are draggable (not appointments). Uses native HTML5 drag-and-drop -- no new dependencies needed.

### How it works
1. Job event pills in calendar cells get `draggable="true"` with `onDragStart` storing the event ID
2. Each day cell becomes a drop target with `onDragOver` (prevent default) and `onDrop`
3. On drop: update the job's `due_date` in Supabase, update local state optimistically, show a toast confirmation
4. Visual feedback: highlight the drop target cell during drag-over with a distinct background color

### Changes

**`src/pages/admin/AdminCalendar.tsx`** -- single file change:
- Add `draggedEventId` state (`string | null`)
- Add `dragOverDate` state (`Date | null`) for visual hover feedback
- On job event pills: set `draggable="true"`, `onDragStart` sets the event ID, add `cursor-grab` styling
- On day cell `<button>`: add `onDragOver` (preventDefault + set dragOverDate), `onDragLeave` (clear), `onDrop` handler
- Drop handler:
  - Find the event by ID, confirm it's a job
  - Call `supabase.from("jobs").update({ due_date: format(targetDay, "yyyy-MM-dd") }).eq("id", eventId)`
  - Optimistically update local `events` state
  - Show success toast via `sonner`
  - Clear drag state
- Add visual class on drag-over cells (e.g. `bg-primary/10 ring-2 ring-primary/30`)
- Appointments are NOT draggable (no `draggable` attribute)

### No database changes needed
The `jobs` table already has `due_date` and existing RLS policies allow admin updates.

### Technical notes
- HTML5 drag-and-drop works well for this grid layout without external libraries
- `dataTransfer.setData("text/plain", eventId)` in dragStart, `getData` in drop
- Toast import from `sonner` (already used in the project)

