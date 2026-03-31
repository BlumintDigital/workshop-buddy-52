

## Analysis

| Page | Has Pagination? |
|------|----------------|
| AdminJobs | Yes |
| AdminAppointments | Yes |
| AdminInvoices | Yes |
| AdminInventory | Yes |
| **AdminClients** | **No** — fetches all clients, filters in memory |

Only **AdminClients** needs pagination added. The other four pages already use `usePagination` with server-side `.range()` queries.

## Plan

### 1. Add server-side pagination to AdminClients

**Problem**: Currently fetches ALL client profiles by first getting all `user_roles` with role `client`, then fetching all matching profiles. This won't scale.

**Solution**: 
- Import `usePagination`, `PAGE_SIZE`, and the `Pagination` UI components
- Change `fetchClients` to accept a `currentPage` parameter and use Supabase `.range()` for the profiles query
- Add a `totalCount` state, using `{ count: "exact" }` on the profiles query
- Keep the existing client-side search/filter for the current page's results (consistent with how other pages work)
- Add the same pagination UI block used in AdminInvoices/AdminInventory at the bottom
- Re-fetch when `page` changes via `useEffect`

**Note**: The current approach queries `user_roles` first to get client IDs, then queries `profiles`. To support proper count + range, we'll query profiles with an `.in("id", allClientIds)` but apply `.range()` and `count: "exact"` to paginate. Since client counts are typically smaller than jobs/invoices, fetching all role IDs first remains acceptable — only the profiles display is paginated.

### Files modified
- `src/pages/admin/AdminClients.tsx` — add pagination hook, totalCount state, range query, pagination UI

