

## Plan: Add Missing Columns to `workshop_settings`

### Problem
The `workshop_settings` table is missing two columns that the `AdminSettings.tsx` code references: `email_notifications_enabled` and `from_email`. This causes a schema cache error when saving settings.

### Fix
Create a database migration to add the missing columns:

```sql
ALTER TABLE public.workshop_settings
ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT false;

ALTER TABLE public.workshop_settings
ADD COLUMN IF NOT EXISTS from_email TEXT DEFAULT NULL;
```

### No code changes needed
`AdminSettings.tsx` already reads/writes these fields (using `as any` casts). After the migration, the columns will exist and everything will work. The TypeScript types file will auto-regenerate from the updated schema.

