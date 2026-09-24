-- Per-user dashboard card layout (design system phase 2).
--
-- Owners and managers can show, hide and reorder the cards on their Today
-- dashboard. The layout is stored per user as an ordered list of card ids plus
-- the ids they have hidden; card definitions live in the app, so unknown ids
-- are ignored and new cards fall back to their role default.
--
-- Kept out of `profiles` on purpose: profile writes require MFA for admins and
-- managers, and a layout preference is not sensitive enough to need it.

CREATE TABLE IF NOT EXISTS public.dashboard_prefs (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  card_order text[] NOT NULL DEFAULT '{}',
  hidden     text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own dashboard prefs" ON public.dashboard_prefs;
CREATE POLICY "Users read their own dashboard prefs"
  ON public.dashboard_prefs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users create their own dashboard prefs" ON public.dashboard_prefs;
CREATE POLICY "Users create their own dashboard prefs"
  ON public.dashboard_prefs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update their own dashboard prefs" ON public.dashboard_prefs;
CREATE POLICY "Users update their own dashboard prefs"
  ON public.dashboard_prefs FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete their own dashboard prefs" ON public.dashboard_prefs;
CREATE POLICY "Users delete their own dashboard prefs"
  ON public.dashboard_prefs FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
