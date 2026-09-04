-- RFN USA admin login V2 fix
-- Run this entire script in Supabase SQL Editor.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text default '',
  role text not null default 'admin' check (role in ('owner','admin','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add both known accounts when they exist in Authentication > Users.
insert into public.admin_users (user_id,email,full_name,role,active)
select id,email,coalesce(raw_user_meta_data->>'full_name','Mostafa Hamdan'),'owner',true
from auth.users
where lower(email) in (lower('hamdanmostafa88@gmail.com'), lower('mustafa078h@gmail.com'))
on conflict (user_id) do update set
  email=excluded.email,
  full_name=excluded.full_name,
  role='owner',
  active=true,
  updated_at=now();

create or replace function public.is_current_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.admin_users a
    join auth.users u on u.id = a.user_id
    where a.active = true
      and a.role in ('owner','admin','staff')
      and (
        a.user_id = auth.uid()
        or lower(a.email) = lower(coalesce(auth.jwt() ->> 'email',''))
      )
  );
$$;

revoke all on function public.is_current_admin() from public;
grant execute on function public.is_current_admin() to authenticated;

-- Database verification only. At least one row should show active=true.
select u.id,u.email,a.role,a.active,(u.id=a.user_id) as ids_match
from auth.users u
left join public.admin_users a on a.user_id=u.id
where lower(u.email) in (lower('hamdanmostafa88@gmail.com'), lower('mustafa078h@gmail.com'));
