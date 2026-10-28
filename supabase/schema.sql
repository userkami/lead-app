-- One-time setup for the existing public.meta_leads table.
-- Prerequisite: remove lead_status from the n8n sync payload.
-- Existing lead rows and the CREATED status default are preserved.
-- Run this entire file together in the Supabase SQL editor.
begin;

-- Fail promptly if the live sync holds a conflicting lock. Retry later if needed.
set local lock_timeout = '5s';

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role text not null default 'manager' check (role in ('admin','manager'))
);
create table public.sales_executives (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp_number text,
  active boolean not null default true,
  destination_type text not null default 'individual' check (destination_type in ('individual','group')),
  whatsapp_group_link text,
  constraint sales_executives_destination_check check (
    (destination_type = 'individual' and nullif(btrim(whatsapp_number), '') is not null and whatsapp_group_link is null)
    or
    (destination_type = 'group' and whatsapp_number is null and coalesce(whatsapp_group_link ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]+/?$', false))
  )
);
alter table public.meta_leads
  add column assigned_to uuid references public.sales_executives(id),
  add column assigned_at timestamptz,
  add column assigned_by uuid references auth.users(id),
  add column notes text;
create index on public.meta_leads (created_time desc);

alter table public.profiles enable row level security;
alter table public.sales_executives enable row level security;
alter table public.meta_leads enable row level security;  -- n8n's sb_secret_ key bypasses RLS

create function public.is_staff() returns boolean language sql security definer stable set search_path=public
as $$ select exists(select 1 from profiles where id = auth.uid()) $$;
create function public.is_admin() returns boolean language sql security definer stable set search_path=public
as $$ select exists(select 1 from profiles where id = auth.uid() and role='admin') $$;

create policy "own profile"   on profiles         for select using (id = auth.uid());
create policy "staff read ex" on sales_executives for select using (is_staff());
create policy "admin write ex" on sales_executives for all using (is_admin()) with check (is_admin());
create policy "staff read leads" on meta_leads    for select using (is_staff());
-- no direct UPDATE policy: changes go through the functions below

-- Atomic assign: only touches leads that are still unassigned (prevents double assignment)
create function public.assign_leads(p_ids text[], p_exec uuid) returns int
language plpgsql security definer set search_path=public as $$
declare n int;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  update meta_leads set assigned_to=p_exec, assigned_at=now(), assigned_by=auth.uid(), lead_status='ASSIGNED'
   where id = any(p_ids) and assigned_to is null;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.update_lead(p_id text, p_status text, p_notes text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  if p_status is null or p_status not in ('CREATED','ASSIGNED','CONTACTED','CLOSED','LOST') then raise exception 'bad status'; end if;
  update meta_leads set lead_status=p_status, notes=p_notes where id=p_id;
end $$;

-- The table may already have Realtime enabled.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'meta_leads'
  ) then
    alter publication supabase_realtime add table public.meta_leads;
  end if;
end $$;

commit;

-- After creating a user in Auth > Users, give them a role:
-- insert into profiles (id, full_name, role) values ('<auth-user-uuid>', 'Name', 'admin');
