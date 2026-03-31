

## Expanding the Admin API — Additional Data Endpoints

The current `admin-api` exposes counts and configuration. To make the global dashboard a true single source of truth, we should expose the actual operational data from each instance. Here's what's available in the schema and worth surfacing:

### New endpoints to add to `admin-api`

#### 1. Jobs list — `GET ?action=jobs`
Full job records with client name, staff name, status, priority, dates, hours. Enables the dashboard to show a cross-instance job board, filter by status, and spot bottlenecks.

#### 2. Invoices & Revenue — `GET ?action=invoices`
Invoice list with status, totals, paid dates, client info. Plus a companion `GET ?action=revenue` that returns monthly revenue aggregates (calls existing `get_monthly_revenue` DB function).

#### 3. Appointments — `GET ?action=appointments`
Upcoming and recent appointments with client name, status, date/time. Lets the dashboard show scheduling load across instances.

#### 4. Inventory — `GET ?action=inventory`
Full inventory item list with quantities, min stock, unit cost, category. Enables central stock monitoring and cross-instance procurement planning.

#### 5. Activity logs — `GET ?action=activity-logs`
Recent activity log entries (last 100 or with pagination). Gives the dashboard a live feed of what's happening in each instance without needing to log into each one.

#### 6. Analytics / Aggregates — `GET ?action=analytics`
Combined endpoint calling existing DB functions:
- `get_monthly_revenue()` — revenue by month
- `get_monthly_bookings()` — bookings by month  
- `get_job_completion_stats()` — jobs by status

Returns all three in one response for charting on the dashboard.

#### 7. Job ratings — `GET ?action=ratings`
Client satisfaction data: average rating, rating count, recent ratings with comments. Useful for quality monitoring across instances.

#### 8. Storage usage — `GET ?action=storage`
List storage buckets and file counts from `job_attachments` table. Helps monitor data growth per instance.

#### 9. Create user — `POST ?action=create-user`
Proxy to the existing `create-client` edge function. Allows creating users on any instance from the central dashboard.

#### 10. Update instance version — `POST ?action=update-version`
Allows the dashboard to set the `instance_version` field after a deployment, keeping version tracking accurate.

### Query parameters for list endpoints
All list endpoints would support:
- `?limit=50` — default 50, max 200
- `?offset=0` — for pagination
- `?status=pending` — filter by status (where applicable)
- `?from=2026-01-01&to=2026-03-31` — date range filters

### Implementation approach
1. Add all new `case` blocks to `supabase/functions/admin-api/index.ts`
2. Each endpoint uses the existing service-role client — no schema changes needed
3. List endpoints join with `profiles` to include readable names instead of just UUIDs
4. The `analytics` endpoint calls the existing RPC functions directly

### Technical details

**File to modify:** `supabase/functions/admin-api/index.ts`

No database migrations needed — all data already exists. We're just exposing read access (and two write proxies) through the existing authenticated API.

The `analytics` endpoint would look like:
```text
Promise.all([
  supabase.rpc("get_monthly_revenue"),
  supabase.rpc("get_monthly_bookings"),
  supabase.rpc("get_job_completion_stats"),
])
```

For list endpoints, joins use the pattern:
```text
supabase.from("jobs")
  .select("*, client:profiles!client_id(full_name, company_name), staff:profiles!assigned_staff_id(full_name)")
  .order("created_at", { ascending: false })
  .range(offset, offset + limit - 1)
```

