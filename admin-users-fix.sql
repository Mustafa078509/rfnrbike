-- RFN USA: fix admin authorization to use public.admin_users
-- Run once in Supabase SQL Editor.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text default '',
  role text not null default 'admin' check (role in ('owner','admin','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists admin_users_updated_at on public.admin_users;
create trigger admin_users_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

-- Add Mostafa as an active owner. The account must already exist in Authentication > Users.
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

alter table public.admin_users enable row level security;

drop policy if exists "Admins read own admin record" on public.admin_users;
create policy "Admins read own admin record"
on public.admin_users for select
to authenticated
using (user_id = auth.uid());

grant select on public.admin_users to authenticated;

-- All dashboard write permissions now check admin_users.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and active = true
      and role in ('owner','admin','staff')
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- Verification result should show one active row.
select user_id, email, full_name, role, active
from public.admin_users
where lower(email) = lower('hamdanmostafa88@gmail.com');
