-- The AI assistant add-on ("Ask Shoplane"). Shoplane Control switches it on per customer
-- (feature flag "assistant", off by default), sets the monthly limit and reads the totals
-- through admin-api (action "assistant").
--
-- The assistant edge function answers as the signed-in person: every lookup runs with their own
-- session, so these rules decide what it can see, exactly as in the app. These tables only hold
-- the limits and the question counts; conversations are not stored.

-- 1. The feature switch (off unless Control turns it on).
alter table public.feature_flags drop constraint if exists feature_flags_key_check;
alter table public.feature_flags add constraint feature_flags_key_check check (key = any (array[
  'appointments', 'client_portal', 'goals', 'reports', 'job_chat', 'inventory', 'shipping',
  'accounting_sync', 'generate_sample_data', 'setup_demo_users', 'backup_restore', 'assistant'
]));

insert into public.feature_flags (key, enabled) values ('assistant', false)
on conflict (key) do nothing;

create or replace function public.is_feature_enabled(feature_key text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select case
    when feature_key in ('appointments','client_portal','goals','reports','job_chat','inventory','shipping','accounting_sync')
      then coalesce((select enabled from public.feature_flags where key = feature_key), true)
    when feature_key in ('generate_sample_data','setup_demo_users','backup_restore','assistant')
      then coalesce((select enabled from public.feature_flags where key = feature_key), false)
    else false
  end;
$$;

-- 2. Limits, set from Control. One row.
create table if not exists public.assistant_settings (
  id smallint primary key default 1 check (id = 1),
  monthly_question_limit integer not null default 1000 check (monthly_question_limit between 0 and 100000),
  daily_question_limit_per_person integer not null default 40 check (daily_question_limit_per_person between 1 and 1000),
  -- Which AI service answers, and which of its models. The keys themselves are edge function
  -- secrets (ANTHROPIC_API_KEY, OPENAI_API_KEY) that Control sets; they never touch the database.
  provider text not null default 'anthropic' check (provider in ('anthropic', 'openai')),
  model text check (model is null or model ~ '^[A-Za-z0-9._:-]{1,80}$'),
  updated_at timestamptz not null default now()
);
insert into public.assistant_settings (id) values (1) on conflict (id) do nothing;

-- 3. Questions asked, per person and day, with the tokens they used.
create table if not exists public.assistant_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  used_on date not null default current_date,
  role text,
  questions integer not null default 0 check (questions >= 0),
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  handed_over integer not null default 0 check (handed_over >= 0),
  primary key (user_id, used_on)
);
create index if not exists assistant_usage_used_on_idx on public.assistant_usage (used_on);

-- Both tables are closed to the app: only the edge functions (service role) use them.
alter table public.assistant_settings enable row level security;
alter table public.assistant_usage enable row level security;
revoke all on public.assistant_settings, public.assistant_usage from anon, authenticated;

create policy "Session must have passed 2FA" on public.assistant_settings
  as restrictive for all to authenticated
  using ((select public.session_verified()))
  with check ((select public.session_verified()));
create policy "Session must have passed 2FA" on public.assistant_usage
  as restrictive for all to authenticated
  using ((select public.session_verified()))
  with check ((select public.session_verified()));

-- Counts one answered question (adding to today's row). Server only.
create or replace function public.assistant_record_usage(
  p_user uuid, p_role text, p_input bigint, p_output bigint, p_handed_over boolean default false
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.assistant_usage (user_id, used_on, role, questions, input_tokens, output_tokens, handed_over)
  values (p_user, current_date, p_role, 1, greatest(p_input, 0), greatest(p_output, 0), case when p_handed_over then 1 else 0 end)
  on conflict (user_id, used_on) do update set
    questions = public.assistant_usage.questions + 1,
    input_tokens = public.assistant_usage.input_tokens + greatest(excluded.input_tokens, 0),
    output_tokens = public.assistant_usage.output_tokens + greatest(excluded.output_tokens, 0),
    handed_over = public.assistant_usage.handed_over + excluded.handed_over,
    role = excluded.role;
$$;

revoke all on function public.assistant_record_usage(uuid, text, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.assistant_record_usage(uuid, text, bigint, bigint, boolean) to service_role;
