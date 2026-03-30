
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
