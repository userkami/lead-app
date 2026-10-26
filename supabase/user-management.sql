-- Run this whole file once after schema.sql. Safe to run again.
-- Does not change existing lead statuses, notes, or assignments.
begin;
set local lock_timeout = '5s';

-- Deleting a login must not delete leads or be blocked by assignment history.
do $$
declare fk record;
begin
  for fk in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'public.meta_leads'::regclass
      and c.contype = 'f' and a.attname = 'assigned_by'
  loop
    execute format('alter table public.meta_leads drop constraint %I', fk.conname);
  end loop;
end;
$$;
alter table public.meta_leads
  add constraint meta_leads_assigned_by_fkey
  foreign key (assigned_by) references auth.users(id) on delete set null;

-- Serialize admin removals/demotions, including requests from different admins.
create or replace function public.protect_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(739174812);
  if old.role = 'admin' then
    if tg_op = 'DELETE' then
      if not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
        raise exception 'The last admin cannot be deleted';
      end if;
    elsif new.role <> 'admin' then
      if not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
        raise exception 'The last admin cannot be demoted';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists protect_last_admin on public.profiles;
create trigger protect_last_admin before update or delete on public.profiles
for each row execute function public.protect_last_admin();

-- Expected owner and timestamp stop stale screens overwriting another staff change.
create or replace function public.change_lead_assignment(
  p_id text,
  p_exec uuid,
  p_expected_exec uuid,
  p_expected_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
declare current_lead public.meta_leads%rowtype;
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  select * into current_lead from public.meta_leads where id = p_id for update;
  if not found then raise exception 'Lead not found'; end if;
  if current_lead.assigned_to is distinct from p_expected_exec
     or current_lead.assigned_at is distinct from p_expected_at then
    raise exception 'Assignment changed. Close and reopen this lead, then try again.';
  end if;
  if p_exec is not null then
    perform 1 from public.sales_executives where id = p_exec and active for share;
    if not found then raise exception 'Choose an active sales executive'; end if;
  end if;
  if current_lead.assigned_to is not distinct from p_exec then return; end if;
  update public.meta_leads
  set assigned_to = p_exec,
      assigned_at = case when p_exec is null then null else now() end,
      assigned_by = case when p_exec is null then null else auth.uid() end,
      lead_status = case when p_exec is null then 'CREATED' else 'ASSIGNED' end
  where id = p_id;
end;
$$;
revoke all on function public.change_lead_assignment(text, uuid, uuid, timestamptz) from public;
grant execute on function public.change_lead_assignment(text, uuid, uuid, timestamptz) to authenticated;
commit;
