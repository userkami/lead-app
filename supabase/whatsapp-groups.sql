-- Adds WhatsApp groups as lead assignment destinations.
-- Run this whole file once after schema.sql and user-management.sql. Safe to run again.
-- Existing executives, lead assignments, statuses, and notes are preserved.
begin;
set local lock_timeout = '5s';

alter table public.sales_executives
  add column if not exists destination_type text,
  add column if not exists whatsapp_group_link text;

update public.sales_executives
set destination_type = 'individual'
where destination_type is null;

alter table public.sales_executives
  alter column destination_type set default 'individual',
  alter column destination_type set not null,
  alter column whatsapp_number drop not null;

alter table public.sales_executives
  drop constraint if exists sales_executives_destination_type_check,
  drop constraint if exists sales_executives_destination_check;

alter table public.sales_executives
  add constraint sales_executives_destination_type_check
    check (destination_type in ('individual','group')),
  add constraint sales_executives_destination_check check (
    (destination_type = 'individual' and nullif(btrim(whatsapp_number), '') is not null and whatsapp_group_link is null)
    or
    (destination_type = 'group' and whatsapp_number is null and coalesce(whatsapp_group_link ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]+/?([?][^[:space:]#]+)?$', false))
  );

commit;
