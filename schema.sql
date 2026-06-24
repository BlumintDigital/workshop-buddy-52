-- ============================================================
-- CONSOLIDATED SCHEMA
-- Generated from 39 migration files
-- Apply this to a fresh Supabase project via:
--   SQL Editor in Supabase Studio  (paste and run)
-- OR:
--   psql -d "postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres" -f schema.sql
-- ============================================================
-- ── 20260330015253_48319888-28fc-4f74-92a9-242d32658574.sql ─────────────────────────────────────────

-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff', 'client');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'client',
  UNIQUE(user_id, role)
);

-- Create jobs table
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','review','completed','cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assigned_staff_id UUID REFERENCES auth.users(id),
  client_id UUID REFERENCES auth.users(id),
  estimated_hours NUMERIC,
  actual_hours NUMERIC,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create job_updates table
CREATE TABLE public.job_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create appointments table
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  type TEXT NOT NULL DEFAULT 'consultation' CHECK (type IN ('consultation','repair','inspection','pickup','delivery')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create inventory_items table
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  category TEXT,
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'pcs',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create inventory_transactions table
CREATE TABLE public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('in','out','adjustment')),
  quantity INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create invoices table
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  client_id UUID NOT NULL REFERENCES auth.users(id),
  job_id UUID REFERENCES public.jobs(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create invoice_items table
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0
);

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'manager'));

-- RLS Policies for user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for jobs
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all jobs" ON public.jobs FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can manage all jobs" ON public.jobs FOR ALL USING (public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Staff can view assigned jobs" ON public.jobs FOR SELECT USING (assigned_staff_id = auth.uid());
CREATE POLICY "Staff can update assigned jobs" ON public.jobs FOR UPDATE USING (assigned_staff_id = auth.uid());
CREATE POLICY "Clients can view own jobs" ON public.jobs FOR SELECT USING (client_id = auth.uid());

-- RLS Policies for job_updates
ALTER TABLE public.job_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all job_updates" ON public.job_updates FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can manage all job_updates" ON public.job_updates FOR ALL USING (public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Staff can view/create updates for assigned jobs" ON public.job_updates FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_updates.job_id AND jobs.assigned_staff_id = auth.uid())
);
CREATE POLICY "Staff can insert updates for assigned jobs" ON public.job_updates FOR INSERT WITH CHECK (
  user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_updates.job_id AND jobs.assigned_staff_id = auth.uid())
);
CREATE POLICY "Clients can view updates for own jobs" ON public.job_updates FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_updates.job_id AND jobs.client_id = auth.uid())
);

-- RLS Policies for appointments
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all appointments" ON public.appointments FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can manage all appointments" ON public.appointments FOR ALL USING (public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Staff can view all appointments" ON public.appointments FOR SELECT USING (public.has_role(auth.uid(), 'staff'));
CREATE POLICY "Clients can view own appointments" ON public.appointments FOR SELECT USING (client_id = auth.uid());
CREATE POLICY "Clients can create appointments" ON public.appointments FOR INSERT WITH CHECK (client_id = auth.uid());
CREATE POLICY "Clients can update own appointments" ON public.appointments FOR UPDATE USING (client_id = auth.uid());

-- RLS Policies for inventory_items
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage inventory" ON public.inventory_items FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can manage inventory" ON public.inventory_items FOR ALL USING (public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Staff can view inventory" ON public.inventory_items FOR SELECT USING (public.has_role(auth.uid(), 'staff'));

-- RLS Policies for inventory_transactions
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage inventory transactions" ON public.inventory_transactions FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can manage inventory transactions" ON public.inventory_transactions FOR ALL USING (public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Staff can view/create inventory transactions" ON public.inventory_transactions FOR SELECT USING (public.has_role(auth.uid(), 'staff'));
CREATE POLICY "Staff can insert inventory transactions" ON public.inventory_transactions FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'staff') AND user_id = auth.uid());

-- RLS Policies for invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all invoices" ON public.invoices FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can manage all invoices" ON public.invoices FOR ALL USING (public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Staff can view invoices" ON public.invoices FOR SELECT USING (public.has_role(auth.uid(), 'staff'));
CREATE POLICY "Clients can view own invoices" ON public.invoices FOR SELECT USING (client_id = auth.uid());

-- RLS Policies for invoice_items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all invoice items" ON public.invoice_items FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can manage all invoice items" ON public.invoice_items FOR ALL USING (public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Staff can view invoice items" ON public.invoice_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_items.invoice_id AND public.has_role(auth.uid(), 'staff'))
);
CREATE POLICY "Clients can view own invoice items" ON public.invoice_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.client_id = auth.uid())
);


-- ── 20260330022636_7c677fa3-6de7-4d1f-8a39-8810730ef932.sql ─────────────────────────────────────────

-- 1. Add stripe_payment_url to invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS stripe_payment_url text;

-- 2. Trigger: auto-create draft invoice when job completed
CREATE OR REPLACE FUNCTION public.create_invoice_on_job_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND NEW.client_id IS NOT NULL THEN
    INSERT INTO public.invoices (invoice_number, client_id, job_id, status, subtotal, tax_rate, tax_amount, total)
    VALUES (
      'INV-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 4),
      NEW.client_id,
      NEW.id,
      'draft',
      0, 0, 0, 0
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_job_completed_create_invoice
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.create_invoice_on_job_completed();

-- 3. RPC: Monthly bookings
CREATE OR REPLACE FUNCTION public.get_monthly_bookings()
RETURNS TABLE(month text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_char(appointment_date::timestamp, 'YYYY-MM') AS month, count(*)
  FROM appointments
  WHERE appointment_date >= (now() - interval '12 months')::date
  GROUP BY month ORDER BY month;
$$;

-- 4. RPC: Monthly revenue
CREATE OR REPLACE FUNCTION public.get_monthly_revenue()
RETURNS TABLE(month text, revenue numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_char(paid_at, 'YYYY-MM') AS month, sum(total) AS revenue
  FROM invoices
  WHERE status = 'paid' AND paid_at >= (now() - interval '12 months')
  GROUP BY month ORDER BY month;
$$;

-- 5. RPC: Job completion stats
CREATE OR REPLACE FUNCTION public.get_job_completion_stats()
RETURNS TABLE(status text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT status, count(*) FROM jobs GROUP BY status;
$$;


-- ── 20260330022952_32a3b4d5-5982-4590-b32f-e67ecd689ba4.sql ─────────────────────────────────────────

-- Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text,
  read boolean NOT NULL DEFAULT false,
  link text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);


-- ── 20260330023028_623764bc-d9bb-4d0f-b5ad-e4de8f72db2e.sql ─────────────────────────────────────────

-- Fix overly permissive insert policy - restrict to service_role only
DROP POLICY "System can insert notifications" ON public.notifications;

CREATE POLICY "Admins can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));


-- ── 20260330023827_4ba1363d-c637-4b91-9af3-c1d8e6c64856.sql ─────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can view roles" ON public.user_roles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can manage roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'manager'::app_role));

-- ── 20260330125536_e0648652-0d37-441b-86c7-8d743b5bb6ff.sql ─────────────────────────────────────────

-- 1. Fix privilege escalation: Drop overly broad policies on user_roles and recreate with proper scoping

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Managers can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Managers can view roles" ON public.user_roles;

-- Recreate admin policy scoped to authenticated only
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Managers can view all roles
CREATE POLICY "Managers can view roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));

-- Managers can update roles but NOT escalate to admin
CREATE POLICY "Managers can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) AND role != 'admin'::app_role);

-- Managers can insert roles but NOT admin role
CREATE POLICY "Managers can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) AND role != 'admin'::app_role);

-- Managers can delete roles but NOT admin role
CREATE POLICY "Managers can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) AND role != 'admin'::app_role);

-- 2. Fix notifications: Allow managers and staff to insert notifications
CREATE POLICY "Managers can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Staff can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'staff'::app_role));

-- Allow users to delete own notifications
CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 3. Fix profiles: Scope admin/manager SELECT policies to authenticated
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Managers can view all profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));


-- ── 20260330130234_64d48e3e-c496-4228-b307-cc0a1999e9d2.sql ─────────────────────────────────────────

-- 1. Fix job_tasks: Replace overly permissive SELECT policy with scoped ones
DROP POLICY IF EXISTS "authenticated can view job tasks" ON public.job_tasks;

-- Clients can only view tasks for their own jobs
CREATE POLICY "Clients can view own job tasks"
ON public.job_tasks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs
    WHERE jobs.id = job_tasks.job_id AND jobs.client_id = auth.uid()
  )
);

-- Staff can view tasks for jobs assigned to them
CREATE POLICY "Staff can view assigned job tasks"
ON public.job_tasks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs
    WHERE jobs.id = job_tasks.job_id AND jobs.assigned_staff_id = auth.uid()
  )
  OR assigned_to = auth.uid()
);

-- Admins and managers already have ALL policies, no change needed

-- 2. Fix manager privilege escalation: prevent managers from targeting admin rows
DROP POLICY IF EXISTS "Managers can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Managers can delete roles" ON public.user_roles;

CREATE POLICY "Managers can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) AND role != 'admin'::app_role)
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) AND role != 'admin'::app_role);

CREATE POLICY "Managers can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) AND role != 'admin'::app_role);

-- 3. Fix storage delete policy: add admin/manager/ownership check
DROP POLICY IF EXISTS "Users can delete own uploads" ON storage.objects;

CREATE POLICY "Users can delete own uploads"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'job-attachments'
  AND (
    -- Admins and managers can delete any file
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    -- Owner check: the file path starts with auth.uid
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);


-- ── 20260330131645_77278b43-0e76-4016-9096-38076b3a3909.sql ─────────────────────────────────────────
UPDATE storage.buckets SET public = false WHERE id = 'job-attachments';

-- ── 20260330132042_b454ddd2-2199-4c2e-a8d5-a2c216d844ac.sql ─────────────────────────────────────────

-- 1. Fix notifications INSERT: restrict target user_id context
-- Staff can only insert notifications for users related to their assigned jobs
DROP POLICY IF EXISTS "Staff can insert notifications" ON public.notifications;
CREATE POLICY "Staff can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'staff'::app_role)
  AND (
    -- Staff can notify clients/managers of their own assigned jobs
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.assigned_staff_id = auth.uid()
      AND (jobs.client_id = notifications.user_id OR notifications.user_id = auth.uid())
    )
    OR notifications.user_id = auth.uid()
  )
);

-- Managers can insert notifications for non-admin users
DROP POLICY IF EXISTS "Managers can insert notifications" ON public.notifications;
CREATE POLICY "Managers can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND NOT has_role(notifications.user_id, 'admin'::app_role)
);

-- Admins keep full insert (already exists, no change needed)

-- 2. Fix managers role assignment: prevent changing user_id on UPDATE
DROP POLICY IF EXISTS "Managers can update roles" ON public.user_roles;
CREATE POLICY "Managers can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) AND role != 'admin'::app_role)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND role != 'admin'::app_role
  -- Prevent re-targeting user_id
  AND user_id = user_id
);

-- 3. Fix storage SELECT: scope to job access
DROP POLICY IF EXISTS "Authenticated users can read" ON storage.objects;
CREATE POLICY "Users can read own job attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'job-attachments'
  AND (
    -- Admins and managers can read all
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    -- Staff can read files for their assigned jobs
    OR EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = (storage.foldername(name))[1]
      AND jobs.assigned_staff_id = auth.uid()
    )
    -- Clients can read files for their own jobs
    OR EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = (storage.foldername(name))[1]
      AND jobs.client_id = auth.uid()
    )
  )
);

-- 4. Fix storage INSERT: restrict to staff/managers/admins with job access
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
CREATE POLICY "Authorized users can upload job attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'job-attachments'
  AND (
    -- Admins and managers can upload to any job
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    -- Staff can upload to their assigned jobs
    OR EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = (storage.foldername(name))[1]
      AND jobs.assigned_staff_id = auth.uid()
    )
    -- Clients can upload to their own jobs
    OR EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = (storage.foldername(name))[1]
      AND jobs.client_id = auth.uid()
    )
  )
);


-- ── 20260330155241_904bd77e-94b6-4547-9cbf-49ef327d3da7.sql ─────────────────────────────────────────

-- Create job_attachments table
CREATE TABLE public.job_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.job_tasks(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT '',
  file_size BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.job_attachments ENABLE ROW LEVEL SECURITY;

-- Admins/managers can manage all
CREATE POLICY "Admins manage job attachments" ON public.job_attachments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers manage job attachments" ON public.job_attachments FOR ALL
  USING (has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

-- Staff can view/insert for assigned jobs
CREATE POLICY "Staff view job attachments" ON public.job_attachments FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) AND EXISTS (
    SELECT 1 FROM public.jobs WHERE jobs.id = job_attachments.job_id AND jobs.assigned_staff_id = auth.uid()
  ));

CREATE POLICY "Staff insert job attachments" ON public.job_attachments FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'staff'::app_role) AND uploaded_by = auth.uid());

-- Clients can view/insert for own jobs
CREATE POLICY "Clients view job attachments" ON public.job_attachments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs WHERE jobs.id = job_attachments.job_id AND jobs.client_id = auth.uid()
  ));

CREATE POLICY "Clients insert job attachments" ON public.job_attachments FOR INSERT
  WITH CHECK (uploaded_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.jobs WHERE jobs.id = job_attachments.job_id AND jobs.client_id = auth.uid()
  ));

-- Create job_task_notes table
CREATE TABLE public.job_task_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.job_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.job_task_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage task notes" ON public.job_task_notes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers manage task notes" ON public.job_task_notes FOR ALL
  USING (has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Staff view task notes" ON public.job_task_notes FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) AND EXISTS (
    SELECT 1 FROM public.job_tasks jt JOIN public.jobs j ON j.id = jt.job_id
    WHERE jt.id = job_task_notes.task_id AND (jt.assigned_to = auth.uid() OR j.assigned_staff_id = auth.uid())
  ));

CREATE POLICY "Staff insert task notes" ON public.job_task_notes FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'staff'::app_role) AND user_id = auth.uid());

CREATE POLICY "Clients view task notes" ON public.job_task_notes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.job_tasks jt JOIN public.jobs j ON j.id = jt.job_id
    WHERE jt.id = job_task_notes.task_id AND j.client_id = auth.uid()
  ));

-- Create job_ratings table
CREATE TABLE public.job_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, client_id)
);

ALTER TABLE public.job_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view ratings" ON public.job_ratings FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers view ratings" ON public.job_ratings FOR SELECT
  USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Staff view ratings for assigned jobs" ON public.job_ratings FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) AND EXISTS (
    SELECT 1 FROM public.jobs WHERE jobs.id = job_ratings.job_id AND jobs.assigned_staff_id = auth.uid()
  ));

CREATE POLICY "Clients manage own ratings" ON public.job_ratings FOR ALL
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());


-- ── 20260330194411_4f7eb475-1fb3-480a-9f6c-ffcd738a1af8.sql ─────────────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.workshop_settings ADD COLUMN IF NOT EXISTS login_image_url text;

-- Create public workshop-assets storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('workshop-assets', 'workshop-assets', true) ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read from workshop-assets (public bucket for login image)
CREATE POLICY "Public read workshop-assets" ON storage.objects FOR SELECT USING (bucket_id = 'workshop-assets');

-- Allow admins to upload to workshop-assets
CREATE POLICY "Admins upload workshop-assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'workshop-assets' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Allow admins to delete from workshop-assets
CREATE POLICY "Admins delete workshop-assets" ON storage.objects FOR DELETE USING (bucket_id = 'workshop-assets' AND public.has_role(auth.uid(), 'admin'::public.app_role));


-- ── 20260330202622_a90e2466-def6-44fa-ac48-61f501dea5f5.sql ─────────────────────────────────────────
-- Activity logs table to track all platform changes
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  summary text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_table_name ON public.activity_logs(table_name);
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view activity logs"
  ON public.activity_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action text;
  _record_id text;
  _user_id uuid;
  _summary text;
  _details jsonb := '{}'::jsonb;
  _table text := TG_TABLE_NAME;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'created';
    _record_id := NEW.id::text;
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'updated';
    _record_id := NEW.id::text;
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'deleted';
    _record_id := OLD.id::text;
  END IF;

  BEGIN
    _user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    _user_id := NULL;
  END;

  IF _table = 'jobs' THEN
    IF TG_OP = 'DELETE' THEN _summary := 'Job "' || OLD.title || '" was deleted';
    ELSIF TG_OP = 'INSERT' THEN _summary := 'Job "' || NEW.title || '" was created';
    ELSE _summary := 'Job "' || NEW.title || '" was updated';
      IF OLD.status IS DISTINCT FROM NEW.status THEN _details := jsonb_build_object('status_change', OLD.status || ' â†’ ' || NEW.status); END IF;
    END IF;
  ELSIF _table = 'appointments' THEN
    IF TG_OP = 'DELETE' THEN _summary := 'Appointment "' || OLD.title || '" was deleted';
    ELSIF TG_OP = 'INSERT' THEN _summary := 'Appointment "' || NEW.title || '" was created';
    ELSE _summary := 'Appointment "' || NEW.title || '" was updated';
      IF OLD.status IS DISTINCT FROM NEW.status THEN _details := jsonb_build_object('status_change', OLD.status || ' â†’ ' || NEW.status); END IF;
    END IF;
  ELSIF _table = 'invoices' THEN
    IF TG_OP = 'DELETE' THEN _summary := 'Invoice ' || OLD.invoice_number || ' was deleted';
    ELSIF TG_OP = 'INSERT' THEN _summary := 'Invoice ' || NEW.invoice_number || ' was created';
    ELSE _summary := 'Invoice ' || NEW.invoice_number || ' was updated';
      IF OLD.status IS DISTINCT FROM NEW.status THEN _details := jsonb_build_object('status_change', OLD.status || ' â†’ ' || NEW.status); END IF;
    END IF;
  ELSIF _table = 'inventory_items' THEN
    IF TG_OP = 'DELETE' THEN _summary := 'Inventory item "' || OLD.name || '" was deleted';
    ELSIF TG_OP = 'INSERT' THEN _summary := 'Inventory item "' || NEW.name || '" was created';
    ELSE _summary := 'Inventory item "' || NEW.name || '" was updated';
      IF OLD.quantity IS DISTINCT FROM NEW.quantity THEN _details := jsonb_build_object('quantity_change', OLD.quantity || ' â†’ ' || NEW.quantity); END IF;
    END IF;
  ELSIF _table = 'profiles' THEN
    IF TG_OP = 'UPDATE' THEN _summary := 'Profile for "' || COALESCE(NEW.full_name, NEW.company_name, 'Unknown') || '" was updated';
    ELSIF TG_OP = 'INSERT' THEN _summary := 'Profile for "' || COALESCE(NEW.full_name, NEW.company_name, 'Unknown') || '" was created';
    ELSE _summary := 'Profile was deleted';
    END IF;
  ELSIF _table = 'user_roles' THEN
    IF TG_OP = 'INSERT' THEN _summary := 'Role "' || NEW.role || '" was assigned'; _details := jsonb_build_object('target_user', NEW.user_id);
    ELSIF TG_OP = 'UPDATE' THEN _summary := 'Role changed from "' || OLD.role || '" to "' || NEW.role || '"'; _details := jsonb_build_object('target_user', NEW.user_id);
    ELSIF TG_OP = 'DELETE' THEN _summary := 'Role "' || OLD.role || '" was removed'; _details := jsonb_build_object('target_user', OLD.user_id);
    END IF;
  ELSIF _table = 'job_tasks' THEN
    IF TG_OP = 'DELETE' THEN _summary := 'Task "' || OLD.title || '" was deleted';
    ELSIF TG_OP = 'INSERT' THEN _summary := 'Task "' || NEW.title || '" was created';
    ELSE _summary := 'Task "' || NEW.title || '" was updated';
      IF OLD.status IS DISTINCT FROM NEW.status THEN _details := jsonb_build_object('status_change', OLD.status || ' â†’ ' || NEW.status); END IF;
    END IF;
  ELSE
    _summary := _table || ' record was ' || _action;
  END IF;

  INSERT INTO public.activity_logs (user_id, action, table_name, record_id, summary, details)
  VALUES (_user_id, _action, _table, _record_id, _summary, _details);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE TRIGGER trg_activity_log_jobs AFTER INSERT OR UPDATE OR DELETE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_activity_log_appointments AFTER INSERT OR UPDATE OR DELETE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_activity_log_invoices AFTER INSERT OR UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_activity_log_inventory AFTER INSERT OR UPDATE OR DELETE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_activity_log_profiles AFTER INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_activity_log_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_activity_log_tasks AFTER INSERT OR UPDATE OR DELETE ON public.job_tasks FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- ── 20260331074713_dd91da49-5fce-4d05-ac3d-f1796f4fdd61.sql ─────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;

-- ── 20260331085350_96eeabb1-48a7-4c9d-97cb-f2c4c47bd6f3.sql ─────────────────────────────────────────
ALTER TABLE public.workshop_settings
ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT false;

ALTER TABLE public.workshop_settings
ADD COLUMN IF NOT EXISTS from_email TEXT DEFAULT NULL;

-- ── 20260331085544_9d6c2676-ba39-4938-96e8-2cc7099a82ab.sql ─────────────────────────────────────────
CREATE POLICY "Anyone can read workshop settings"
ON public.workshop_settings
FOR SELECT
TO public
USING (true);

-- ── 20260331104314_58caade2-a6cb-4693-9414-a381274bd39e.sql ─────────────────────────────────────────
ALTER TABLE public.workshop_settings ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL;

-- ── 20260331143038_ac475754-a727-49bd-8006-b925bd5b3f9c.sql ─────────────────────────────────────────
-- Fix inventory_items RLS policies with explicit WITH CHECK
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

CREATE POLICY "Staff can update inventory quantity" ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'staff'));

-- Fix inventory_transactions RLS policies with explicit WITH CHECK
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

-- ── 20260331145450_61d681c2-f0e5-4c1d-9114-fb42d6d48598.sql ─────────────────────────────────────────
-- 1. Remove activity_logs from Realtime publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'activity_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.activity_logs;
  END IF;
END $$;

-- 2. Restrict workshop_settings to authenticated users only
DROP POLICY IF EXISTS "Anyone can read workshop settings" ON public.workshop_settings;
CREATE POLICY "Authenticated users can read workshop settings" ON public.workshop_settings
  FOR SELECT TO authenticated
  USING (true);

-- 3. Add UPDATE policies for job-attachments storage bucket
CREATE POLICY "Admins can update job attachments"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'job-attachments' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'job-attachments' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can update job attachments"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'job-attachments' AND public.has_role(auth.uid(), 'manager'))
  WITH CHECK (bucket_id = 'job-attachments' AND public.has_role(auth.uid(), 'manager'));

-- 4. Fix manager role escalation tautology
DROP POLICY IF EXISTS "Managers can update roles" ON public.user_roles;
CREATE POLICY "Managers can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'manager') AND role <> 'admin')
  WITH CHECK (public.has_role(auth.uid(), 'manager') AND role <> 'admin');

-- ── 20260331150354_8a84cc35-f28f-48e1-8586-b10419bfdf46.sql ─────────────────────────────────────────
-- Add back anon SELECT so login page can read branding
CREATE POLICY "Anon can read workshop settings" ON public.workshop_settings
  FOR SELECT TO anon
  USING (true);

-- ── 20260331153911_02f8856a-e547-47ac-83ae-3977cfa122e6.sql ─────────────────────────────────────────
-- Create a public view with only safe branding columns
CREATE OR REPLACE VIEW public.workshop_settings_public AS
  SELECT id, workshop_name, logo_url, login_image_url, currency
  FROM public.workshop_settings;

-- Grant anon access to the view
GRANT SELECT ON public.workshop_settings_public TO anon;

-- Drop the overly permissive anon policy on the full table
DROP POLICY IF EXISTS "Anon can read workshop settings" ON public.workshop_settings;

-- ── 20260331153942_898cd66f-b896-4941-bc12-75e6fcbc90b9.sql ─────────────────────────────────────────
-- Recreate view with SECURITY INVOKER to fix the security definer linter warning
DROP VIEW IF EXISTS public.workshop_settings_public;
CREATE VIEW public.workshop_settings_public
  WITH (security_invoker = true)
  AS SELECT id, workshop_name, logo_url, login_image_url, currency
  FROM public.workshop_settings;

-- Grant anon access to the view
GRANT SELECT ON public.workshop_settings_public TO anon;

-- We need a policy allowing anon to read workshop_settings through the view
-- since SECURITY INVOKER means RLS is checked as the calling user (anon)
CREATE POLICY "Anon can read workshop settings for view"
  ON public.workshop_settings
  FOR SELECT TO anon
  USING (true);

-- ── 20260331155459_17cf4cef-a9dc-4941-a2fd-5c75520a4c7e.sql ─────────────────────────────────────────
-- 1. Fix Security Definer View: recreate with security_invoker=true
DROP VIEW IF EXISTS public.workshop_settings_public;
CREATE VIEW public.workshop_settings_public
  WITH (security_invoker = true)
  AS SELECT id, workshop_name, logo_url, login_image_url, currency
  FROM public.workshop_settings;

GRANT SELECT ON public.workshop_settings_public TO anon;
GRANT SELECT ON public.workshop_settings_public TO authenticated;

CREATE POLICY "Anon can read workshop settings via view"
  ON public.workshop_settings FOR SELECT TO anon
  USING (true);

-- 2. Fix Activity Logs: deny direct INSERT/UPDATE/DELETE
CREATE POLICY "Deny direct insert to activity_logs"
  ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Deny direct update to activity_logs"
  ON public.activity_logs FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "Deny direct delete to activity_logs"
  ON public.activity_logs FOR DELETE TO authenticated
  USING (false);

-- 3. Fix Manager Privilege Escalation: managers can only manage staff/client roles
DROP POLICY IF EXISTS "Managers can update roles" ON public.user_roles;
CREATE POLICY "Managers can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND role <> 'admin'::app_role
    AND role <> 'manager'::app_role
  )
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role)
    AND role <> 'admin'::app_role
    AND role <> 'manager'::app_role
  );

DROP POLICY IF EXISTS "Managers can insert roles" ON public.user_roles;
CREATE POLICY "Managers can insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role)
    AND role <> 'admin'::app_role
    AND role <> 'manager'::app_role
  );

DROP POLICY IF EXISTS "Managers can delete roles" ON public.user_roles;
CREATE POLICY "Managers can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND role <> 'admin'::app_role
    AND role <> 'manager'::app_role
  );

-- 4. Fix Workshop Settings Exposure: restrict base table to admin/manager only
DROP POLICY IF EXISTS "Authenticated users can read workshop settings" ON public.workshop_settings;
CREATE POLICY "Admin manager can read workshop settings"
  ON public.workshop_settings FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- 5. Fix Storage Delete Policy: use job-based ownership
DROP POLICY IF EXISTS "Users can delete own uploads" ON storage.objects;
CREATE POLICY "Users can delete own uploads"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'job-attachments'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.jobs
        WHERE jobs.id::text = (storage.foldername(name))[1]
          AND (jobs.assigned_staff_id = auth.uid() OR jobs.client_id = auth.uid())
      )
    )
  );

-- ── 20260331155614_978aa222-598c-4dfd-aa20-054b8edf40b6.sql ─────────────────────────────────────────
-- 1. Fix anon access to workshop_settings: use a security definer function instead of direct anon SELECT
-- The view with security_invoker=true needs the caller to have SELECT on the base table.
-- Since we can't restrict columns via RLS, we'll switch back to security_definer view
-- but that's what triggered the original lint warning. Instead, let's keep security_invoker
-- and accept the anon policy on the base table is needed, but mark it clearly.
-- Actually the correct approach: drop the anon policy, recreate view as SECURITY DEFINER
-- (which is appropriate here since we intentionally restrict columns), and silence the lint.

-- Drop the anon policy that exposes the full base table
DROP POLICY IF EXISTS "Anon can read workshop settings via view" ON public.workshop_settings;
DROP POLICY IF EXISTS "Anon can read workshop settings for view" ON public.workshop_settings;

-- Recreate view as security definer (intentional: it only exposes safe columns)
DROP VIEW IF EXISTS public.workshop_settings_public;
CREATE VIEW public.workshop_settings_public
  AS SELECT id, workshop_name, logo_url, login_image_url, currency
  FROM public.workshop_settings;

GRANT SELECT ON public.workshop_settings_public TO anon;
GRANT SELECT ON public.workshop_settings_public TO authenticated;

-- 2. Add anon deny policies on activity_logs
CREATE POLICY "Deny anon insert to activity_logs"
  ON public.activity_logs FOR INSERT TO anon
  WITH CHECK (false);

CREATE POLICY "Deny anon select activity_logs"
  ON public.activity_logs FOR SELECT TO anon
  USING (false);

-- 3. Tighten manager notification policy
DROP POLICY IF EXISTS "Managers can insert notifications" ON public.notifications;
CREATE POLICY "Managers can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role)
    AND (
      has_role(user_id, 'staff'::app_role)
      OR has_role(user_id, 'client'::app_role)
      OR user_id = auth.uid()
    )
  );

-- ── 20260331155722_90e48626-ee65-4a7f-b387-b4745b7161d8.sql ─────────────────────────────────────────
-- 1. Replace permissive deny policies with restrictive ones on activity_logs
DROP POLICY IF EXISTS "Deny direct insert to activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Deny direct update to activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Deny direct delete to activity_logs" ON public.activity_logs;

CREATE POLICY "Block direct insert to activity_logs"
  ON public.activity_logs AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block direct update to activity_logs"
  ON public.activity_logs AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "Block direct delete to activity_logs"
  ON public.activity_logs AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

-- 2. Fix admins only policy: change from public to authenticated
DROP POLICY IF EXISTS "admins only" ON public.workshop_settings;
CREATE POLICY "admins only"
  ON public.workshop_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ── 20260331155901_3bac8f5e-752d-4eb1-bff1-26ffe84e077f.sql ─────────────────────────────────────────
GRANT SELECT ON public.workshop_settings_public TO anon;
GRANT SELECT ON public.workshop_settings_public TO authenticated;

-- ── 20260331165531_1057e4aa-93f2-486c-8a6e-a2a35f912ac6.sql ─────────────────────────────────────────
ALTER TABLE public.workshop_settings ADD COLUMN IF NOT EXISTS instance_version text DEFAULT '1.0.0';

-- ── 20260331174354_6dba94b7-846a-4053-abc3-12af3a90abf7.sql ─────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN is_super_admin boolean NOT NULL DEFAULT false;

-- ── 20260406000000_staff_view_all_jobs.sql ─────────────────────────────────────────
-- Allow staff to view all jobs in the organisation (not just their assigned ones).
-- Staff can still only UPDATE jobs assigned to them (existing policy unchanged).

DROP POLICY IF EXISTS "Staff can view assigned jobs" ON public.jobs;

CREATE POLICY "Staff can view all jobs"
  ON public.jobs
  FOR SELECT
  USING (public.has_role(auth.uid(), 'staff'));


-- ── 20260406000001_quote_status_and_task_due_date.sql ─────────────────────────────────────────
-- Add 'quote' to jobs status constraint
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_status_check,
  ADD CONSTRAINT jobs_status_check
    CHECK (status IN ('quote','pending','in_progress','review','completed','cancelled'));

-- Add due_date and order_index to job_tasks
ALTER TABLE public.job_tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.job_tasks ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;


-- ── 20260406000002_task_value_and_monthly_goal.sql ─────────────────────────────────────────
-- Monetary value per task (set by admin/manager, contributes to monthly goal when completed)
ALTER TABLE public.job_tasks ADD COLUMN IF NOT EXISTS value NUMERIC(10,2) DEFAULT 0;

-- Company monthly revenue goal stored in workshop_settings
ALTER TABLE public.workshop_settings ADD COLUMN IF NOT EXISTS monthly_goal NUMERIC(10,2);


-- ── 20260408000001_bug_reports.sql ─────────────────────────────────────────
CREATE TABLE public.bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  page_url TEXT,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can insert their own reports
CREATE POLICY "Users can submit bug reports"
  ON public.bug_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all reports; users can read their own
CREATE POLICY "Admins can view all reports"
  ON public.bug_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR user_id = auth.uid()
  );

-- Only admins can update status
CREATE POLICY "Admins can update report status"
  ON public.bug_reports FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));


-- ── 20260409153025_219df042-8a37-4658-bde4-778c726be05f.sql ─────────────────────────────────────────
ALTER TABLE public.workshop_settings ADD COLUMN IF NOT EXISTS super_admin_email text DEFAULT NULL;

-- Recreate the public view WITHOUT super_admin_email
CREATE OR REPLACE VIEW public.workshop_settings_public AS
SELECT id, workshop_name, logo_url, login_image_url, currency
FROM public.workshop_settings;

-- ── 20260409154017_9ade6b38-01b0-4398-ad4c-27f8cf66713f.sql ─────────────────────────────────────────
-- Add manager read policy to bug_reports (table already created in 20260408000001)
-- Using DO block to avoid error if policy already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bug_reports'
      AND policyname = 'Managers view bug reports'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Managers view bug reports"
        ON public.bug_reports FOR SELECT
        TO authenticated
        USING (public.has_role(auth.uid(), 'manager'))
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bug_reports'
      AND policyname = 'Admins manage bug reports'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins manage bug reports"
        ON public.bug_reports FOR ALL
        TO authenticated
        USING (public.has_role(auth.uid(), 'admin'))
        WITH CHECK (public.has_role(auth.uid(), 'admin'))
    $policy$;
  END IF;
END $$;


-- ── 20260409200000_email_notification_config_fn.sql ─────────────────────────────────────────
-- SECURITY DEFINER function so any authenticated user can retrieve
-- just the email notification flag and recipient without exposing
-- the full workshop_settings table via RLS.
CREATE OR REPLACE FUNCTION public.get_email_notification_config()
RETURNS TABLE (email_notifications_enabled boolean, recipient_email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ws.email_notifications_enabled,
    COALESCE(ws.super_admin_email, ws.contact_email) AS recipient_email
  FROM workshop_settings ws
  WHERE ws.id = 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_notification_config() TO authenticated;


-- ── 20260416000001_ensure_workshop_settings_rls.sql ─────────────────────────────────────────
-- Ensure RLS is explicitly enabled on workshop_settings.
-- This is idempotent â€” safe to run even if already enabled.
ALTER TABLE public.workshop_settings ENABLE ROW LEVEL SECURITY;


-- ── 20260624000001_monthly_revenue_goals.sql ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.monthly_revenue_goals (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  year        INT NOT NULL,
  month       INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  goal_amount NUMERIC(10,2) NOT NULL,
  set_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(year, month)
);

ALTER TABLE public.monthly_revenue_goals ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read past goals (Goals page needs this)
CREATE POLICY "select_authenticated" ON public.monthly_revenue_goals
  FOR SELECT TO authenticated USING (true);

-- Only admins/managers can insert â€” no UPDATE or DELETE, so goals are immutable once set
CREATE POLICY "insert_admin_manager" ON public.monthly_revenue_goals
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );


-- ── 20260624000002_feature_flags.sql ─────────────────────────────────────────
-- Add feature_flags JSONB column to workshop_settings.
-- All flags default to true for backward compatibility â€” existing customers are unaffected.
ALTER TABLE public.workshop_settings
  ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{
    "goals": true,
    "client_portal": true,
    "reports": true,
    "appointments": true
  }'::jsonb;


-- ── 20260624000003_push_subscriptions.sql ─────────────────────────────────────────
-- VAPID public key stored here so the frontend can read it without a secret
ALTER TABLE public.workshop_settings
  ADD COLUMN IF NOT EXISTS vapid_public_key TEXT;

-- Push subscriptions: one row per browser session per user
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth_key    TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Each user can only manage their own subscriptions
CREATE POLICY "users_own_subscriptions" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ── 20260624172135_4e8badf8-18f4-4b25-a677-fab87418ba56.sql ─────────────────────────────────────────
-- MFA trusted devices and backup codes
CREATE TABLE public.mfa_trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  device_label text,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token_hash)
);
CREATE INDEX mfa_trusted_devices_user_idx ON public.mfa_trusted_devices(user_id);

GRANT SELECT, DELETE ON public.mfa_trusted_devices TO authenticated;
GRANT ALL ON public.mfa_trusted_devices TO service_role;
ALTER TABLE public.mfa_trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trusted devices"
  ON public.mfa_trusted_devices FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trusted devices"
  ON public.mfa_trusted_devices FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.mfa_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);
CREATE INDEX mfa_backup_codes_user_idx ON public.mfa_backup_codes(user_id);

GRANT SELECT ON public.mfa_backup_codes TO authenticated;
GRANT ALL ON public.mfa_backup_codes TO service_role;
ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backup codes"
  ON public.mfa_backup_codes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

