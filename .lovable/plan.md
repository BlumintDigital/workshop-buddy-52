

## Plan: Workshop Name & Logo on Login Page

### Problem
The login page shows a hardcoded "Workshop Manager" title and a generic wrench icon. The admin can already set a `workshop_name` in settings, but it's not used on the login page. There's no logo upload capability either.

### Changes

#### 1. Database Migration
Add a `logo_url` column to `workshop_settings`:
```sql
ALTER TABLE public.workshop_settings
ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL;
```

#### 2. Admin Settings (src/pages/admin/AdminSettings.tsx)
- Add `logo_url` to `defaultSettings`
- Add a logo upload section (similar to the existing login image upload) that uploads to the `workshop-assets` bucket and saves the URL to `logo_url`

#### 3. Auth Page (src/pages/Auth.tsx)
- Expand the existing settings fetch to also pull `workshop_name` and `logo_url`
- Replace the hardcoded "Workshop Manager" heading with the fetched `workshop_name` (fallback to "Workshop Manager")
- Replace the wrench icon with the uploaded logo image when `logo_url` is set (fallback to wrench icon)
- Update both the left-side header area and the right-side hero panel to use the dynamic name/logo

#### 4. Files Modified
- `supabase/migrations/` — new migration for `logo_url` column
- `src/pages/admin/AdminSettings.tsx` — logo upload UI
- `src/pages/Auth.tsx` — dynamic name/logo display

### Technical Details
- The `workshop-assets` bucket is already public, so logo URLs will be accessible without auth
- The existing public SELECT policy on `workshop_settings` means the login page can read these values without authentication
- Logo displays as a small image (e.g. 48x48) in place of the wrench icon

