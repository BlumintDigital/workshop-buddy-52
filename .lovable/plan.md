

## Workshop Management System

A manufacturing/fabrication workshop management system with role-based access, inspired by the shadcn-admin dashboard design (collapsible sidebar, top header with search & user menu, card-based stats, clean data tables).

### 1. Authentication & Roles
- **Login/Signup pages** with email & password via Supabase Auth
- **Database tables**: `profiles` (user info, linked to auth.users), `user_roles` (with `app_role` enum: admin, manager, staff, client)
- **Security definer function** `has_role()` to avoid RLS recursion
- **Post-login redirect** to `/admin/dashboard`, `/manager/dashboard`, `/staff/dashboard`, or `/client/dashboard` based on role
- **Protected routes** with role-checking wrapper component

### 2. Layout & Design (shadcn-admin style)
- **Collapsible sidebar** with role-specific navigation items, app logo, and user info at bottom
- **Top header** with breadcrumbs, search bar, theme toggle, and user avatar dropdown
- **Dashboard pages** with stat cards, charts (recharts), and recent activity tables
- Each role gets a tailored sidebar menu and dashboard view

### 3. Job/Task Tracking Module
- **Tables**: `jobs` (title, description, status, priority, assigned_staff, client_id, dates), `job_updates` (status history/notes)
- **Features**: Create/assign jobs, kanban-style or table view, status workflow (pending → in-progress → review → completed), filter/search
- **Permissions**: Admin/Manager create & assign; Staff view/update assigned jobs; Client view own jobs

### 4. Appointment/Booking Module
- **Table**: `appointments` (client_id, date, time, type, status, notes)
- **Features**: Calendar view and list view, book/reschedule/cancel, approval workflow
- **Permissions**: Admin/Manager manage all; Staff view schedule; Client book & view own

### 5. Inventory Management Module
- **Tables**: `inventory_items` (name, SKU, category, quantity, min_stock, unit_cost), `inventory_transactions` (item_id, type, quantity, job_id reference)
- **Features**: Stock levels dashboard with low-stock alerts, add/edit items, track usage per job
- **Permissions**: Admin/Manager full CRUD; Staff view & log usage; Client no access

### 6. Invoicing & Payments Module
- **Tables**: `invoices` (client_id, job_id, amount, status, due_date), `invoice_items` (line items)
- **Features**: Generate invoices from completed jobs, PDF-style invoice view, status tracking (draft → sent → paid → overdue)
- **Permissions**: Admin/Manager create & manage; Staff view; Client view & download own invoices

### 7. RLS Policies
- All tables secured with row-level security using the `has_role()` function
- Client users can only access their own data
- Staff can access assigned jobs and related data
- Manager and Admin have broader access with Admin having full control

