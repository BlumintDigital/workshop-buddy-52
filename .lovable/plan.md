

## Plan: Multi-feature Enhancement

This is a large set of changes spanning 10+ areas. Here's the breakdown:

---

### 1. Enhanced Task Creation Dialog (JobDetail.tsx)
- Add file attachment upload directly in the "Add Task" dialog (reuse existing `taskFileInputRef` pattern)
- Add a file input below the description field so admins/managers can attach files when creating a task, not just after

### 2. Beautiful Split-Screen Auth Page (Auth.tsx)
- Redesign to a 50/50 layout: left side = form, right side = hero image
- On mobile, hide the image panel and show only the form
- Image URL stored in `workshop_settings` table (new column `login_image_url`)
- Default to a placeholder/gradient if no image is set

### 3. Settings: Login Image Upload (AdminSettings.tsx)
- Add a new "Branding" tab in settings
- Allow admin to upload an image to Supabase Storage (`workshop-assets` bucket) and save the URL to `workshop_settings.login_image_url`

### 4. Database Migration
Add columns to `profiles` table for company data and `workshop_settings` for login image:
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE workshop_settings ADD COLUMN IF NOT EXISTS login_image_url text;
```

### 5. Clients = Companies (AdminClients.tsx + create-client edge function)
- Change "Add Client" form fields to: Company Name, Contact Person, Email, Phone, Address
- Update `ClientRow` type and table columns accordingly
- Update `create-client` edge function to accept `company_name`, `contact_person`, `address`
- Map `company_name` to `profiles.company_name`, `contact_person` to `profiles.contact_person`, `address` to `profiles.address`
- The `full_name` field on profiles will store the company name for clients
- Table columns: Company Name, Contact Person, Phone, Address, Portal Active, Actions

### 6. Sidebar Menu Grouping (AppSidebar.tsx)
Reorganize admin nav into logical groups using multiple `SidebarGroup` sections:
- **Overview**: Dashboard
- **Operations**: Jobs, Appointments, Calendar
- **Management**: Inventory, Invoices, Reports
- **People**: Users, Clients
- **System**: Settings

Similar grouping for manager, staff, and client roles.

### 7. Settings Enhancements (AdminSettings.tsx)
- Replace the currency text input with a proper `<Select>` dropdown with common currencies (USD, EUR, GBP, CAD, AUD, NGN, ZAR, KES, etc.)

### 8. Job Creation: Add Due Date (AdminJobs.tsx)
- Add a due date `<Input type="date">` field to the "Create New Job" dialog
- Include `due_date` in the insert payload

### 9. Profile Page (new file + routes)
- Create `src/pages/profile/UserProfile.tsx` -- shows current user's profile with editable fields (name, phone, email display)
- Add route `/profile` accessible by all authenticated roles
- Add "Profile" link in sidebar footer dropdown menu (next to Sign Out)

### 10. Mobile Optimization

**Jobs tabs (AdminJobs, StaffJobs, ClientJobs)**:
- Make TabsList horizontally scrollable with `overflow-x-auto` and `flex-nowrap` instead of `flex-wrap`

**Users page (AdminUsers.tsx)**:
- Hide "Joined" column on mobile (`hidden sm:table-cell`)
- Make role select narrower on mobile

**Clients page (AdminClients.tsx)**:
- Use card-based layout on mobile instead of table
- Hide Address/Joined columns on mobile

**Settings page (AdminSettings.tsx)**:
- Make TabsList scrollable horizontally on mobile
- Ensure all form inputs are full-width

---

### Files to Create
- `src/pages/profile/UserProfile.tsx`

### Files to Modify
- `src/pages/Auth.tsx` -- split-screen layout
- `src/pages/jobs/JobDetail.tsx` -- task attachment in dialog
- `src/pages/admin/AdminJobs.tsx` -- due date field
- `src/pages/admin/AdminClients.tsx` -- company fields, mobile cards
- `src/pages/admin/AdminUsers.tsx` -- mobile optimization
- `src/pages/admin/AdminSettings.tsx` -- currency select, branding tab
- `src/components/layout/AppSidebar.tsx` -- grouped nav
- `src/App.tsx` -- profile route
- `supabase/functions/create-client/index.ts` -- company fields
- `src/pages/staff/StaffJobs.tsx` -- mobile tab fix

### Database Migration
- Add `company_name`, `contact_person`, `address` to `profiles`
- Add `login_image_url` to `workshop_settings`
- Create `workshop-assets` storage bucket (public)

