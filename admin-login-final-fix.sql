-- Final admin login fix for RFN USA
-- Run this entire file once in Supabase SQL Editor.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text default '',
  role text not null default 'admin' check (role in ('owner','admin','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Recreate Mostafa's admin row using the exact auth.users UUID.
delete from public.admin_users
where lower(email) = lower('hamdanmostafa88@gmail.com')
  and user_id not in (
    select id from auth.users
    where lower(email) = lower('hamdanmostafa88@gmail.com')
  );

insert into public.admin_users (user_id, email, full_name, role, active)
select id, email, 'Mostafa Hamdan', 'owner', true
from auth.users
where lower(email) = lower('hamdanmostafa88@gmail.com')
on conflict (user_id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  role = 'owner',
  active = true,
  updated_at = now();

-- Security-definer RPC avoids RLS blocking the login check.
create or replace function public.get_my_admin_record()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select a.user_id, a.email, a.full_name, a.role, a.active
  from public.admin_users a
  where a.user_id = auth.uid()
    and a.active = true
    and a.role in ('owner','admin','staff')
  limit 1;
$$;

revoke all on function public.get_my_admin_record() from public;
grant execute on function public.get_my_admin_record() to authenticated;

-- Verification: must return one row and matching UUIDs.
select
  u.id as auth_user_id,
  u.email as auth_email,
  a.user_id as admin_user_id,
  a.role,
  a.active,
  (u.id = a.user_id) as ids_match
from auth.users u
left join public.admin_users a on a.user_id = u.id
where lower(u.email) = lower('hamdanmostafa88@gmail.com');
