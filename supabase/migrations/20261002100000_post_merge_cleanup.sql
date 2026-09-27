-- Post-merge cleanup for the project lifecycle.
--
-- 1. Staff no longer change stock directly: the inventory team does it through
--    the "Stores manages stock" policy, requests and purchase orders.
-- 2. job_updates is retired. Its rows were copied into job_comments (as internal
--    notes, source 'update', legacy_update_id) in phase A, and nothing in the app
--    reads or writes it any more.

DROP POLICY IF EXISTS "Staff can update inventory quantity" ON public.inventory_items;

DO $$
BEGIN
  IF to_regclass('public.job_updates') IS NOT NULL THEN
    -- Copy anything written since phase A before the table goes.
    PERFORM public.job_update_to_note(u.id)
    FROM public.job_updates u
    WHERE NOT EXISTS (SELECT 1 FROM public.job_comments c WHERE c.legacy_update_id = u.id);
  END IF;
END $$;

DROP TABLE IF EXISTS public.job_updates;
DROP FUNCTION IF EXISTS public.job_updates_mirror();
DROP FUNCTION IF EXISTS public.job_update_to_note(uuid);
