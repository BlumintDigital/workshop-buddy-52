

## Fix: Settings Tabs Mobile Scrolling + Mobile Responsiveness Audit

### Problem
The Settings page has 6 tabs (General, Billing, Notifications, Branding, Email, Data) using `flex overflow-x-auto flex-nowrap`, which causes sideways scrolling on a 390px viewport. The user wants tabs to fit without horizontal scrolling.

### Solution

**File: `src/pages/admin/AdminSettings.tsx` (line 165)**
- Change `TabsList` from `flex overflow-x-auto flex-nowrap w-full` to `grid grid-cols-3 w-full h-auto` so the 6 tabs wrap into 2 rows of 3 on mobile, no scrolling needed
- Each tab trigger gets `text-xs sm:text-sm` for smaller text on mobile

**Already working correctly (no changes needed):**
- **Jobs tabs** (AdminJobs, StaffJobs, ClientJobs): Only 4-5 tabs, `overflow-x-auto flex-nowrap` works fine at 390px — these fit
- **Users page**: Already has mobile card layout (line 99-113 in AdminUsers.tsx)
- **Clients page**: Already has mobile card layout (line 231-249 in AdminClients.tsx)

### Technical Detail
The `grid-cols-3` approach splits 6 tabs into 2 rows of 3, keeping all tabs visible without scroll. The `h-auto` override is needed because the base `TabsList` sets `h-10` which constrains to one row.

