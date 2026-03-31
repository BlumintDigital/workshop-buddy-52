

## Fix Inventory Stock Operations

### Problem
Stock in, stock out, and set exact quantity operations appear to complete but don't actually persist. The most likely causes:

1. **Silent RLS failures**: Supabase returns `{ error: null, data: [] }` when an UPDATE is blocked by RLS (0 rows affected, no error). The code only checks `error`, so it shows "Stock updated" even when nothing changed.
2. **Missing WITH CHECK on ALL policies**: The admin/manager ALL policies on `inventory_items` only have a USING clause. While Postgres should default WITH CHECK to USING, explicitly adding it ensures UPDATE/INSERT operations pass the policy check.
3. **Silent early return**: If `user` is null (e.g. due to auth state flicker), `handleAdjust` returns silently with no feedback.

### Plan

**Step 1 — Add explicit WITH CHECK to inventory RLS policies (migration)**

Add WITH CHECK expressions to the existing ALL policies for `inventory_items`:

```sql
DROP POLICY "Admins can manage inventory" ON public.inventory_items;
CREATE POLICY "Admins can manage inventory" ON public.inventory_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Managers can manage inventory" ON public.inventory_items;
CREATE POLICY "Managers can manage inventory" ON public.inventory_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));
```

Same for `inventory_transactions`:
```sql
DROP POLICY "Admins can manage inventory transactions" ON public.inventory_transactions;
CREATE POLICY "Admins can manage inventory transactions" ON public.inventory_transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Managers can manage inventory transactions" ON public.inventory_transactions;
CREATE POLICY "Managers can manage inventory transactions" ON public.inventory_transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));
```

Also add a staff UPDATE policy on `inventory_items` so staff can update quantity when logging usage:
```sql
CREATE POLICY "Staff can update inventory quantity" ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'staff'));
```

**Step 2 — Fix error handling in AdminInventory.tsx and StaffInventory.tsx**

Update `handleAdjust` in both files to:
- Show a toast when `user` is null instead of silently returning
- Use `.select()` on the update call to verify rows were actually affected
- Show an error if 0 rows were updated

```ts
const handleAdjust = async () => {
  if (!adjustItem) return;
  if (!user) { toast.error("You must be logged in"); return; }
  
  // ... quantity calc unchanged ...

  const { error: txError } = await supabase.from("inventory_transactions").insert({...});
  if (txError) { toast.error("Failed to log transaction: " + txError.message); return; }

  const { data: updated, error: updateError } = await supabase
    .from("inventory_items")
    .update({ quantity: newQuantity })
    .eq("id", adjustItem.id)
    .select();
  
  if (updateError) { toast.error("Failed to update stock: " + updateError.message); return; }
  if (!updated || updated.length === 0) { toast.error("Stock update was blocked. Please try again."); return; }

  toast.success("Stock updated");
  // ... rest unchanged
};
```

### Files changed
- `supabase/migrations/` — new migration for RLS policy updates
- `src/pages/admin/AdminInventory.tsx` — improved error handling in `handleAdjust`
- `src/pages/staff/StaffInventory.tsx` — same error handling fix

