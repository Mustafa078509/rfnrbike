-- RFN USA: Admin roles + inventory database
-- Run this entire file once in Supabase Dashboard > SQL Editor > New query.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role text not null default 'dealer' check (role in ('admin','dealer')),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  bike_model text not null,
  part_name text not null,
  part_number text,
  quantity integer not null default 0 check (quantity >= 0),
  dealer_price numeric(12,2) not null default 0 check (dealer_price >= 0),
  retail_price numeric(12,2) not null default 0 check (retail_price >= 0),
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_set_updated_at on public.inventory;
create trigger inventory_set_updated_at
before update on public.inventory
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  assigned_role text;
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    assigned_role := 'dealer';
  else
    assigned_role := 'admin';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    assigned_role
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Import accounts that were created before this SQL was installed.
insert into public.profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  'dealer'
from auth.users u
on conflict (id) do nothing;

-- Make the earliest existing account the first admin when no admin exists.
do $$
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    update public.profiles
    set role = 'admin'
    where id = (select id from public.profiles order by created_at asc limit 1);
  end if;
end $$;

alter table public.profiles enable row level security;
alter table public.inventory enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "Admins update profiles" on public.profiles;
create policy "Admins update profiles"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated read inventory" on public.inventory;
create policy "Authenticated read inventory"
on public.inventory for select
to authenticated
using (true);

drop policy if exists "Admins insert inventory" on public.inventory;
create policy "Admins insert inventory"
on public.inventory for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins update inventory" on public.inventory;
create policy "Admins update inventory"
on public.inventory for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins delete inventory" on public.inventory;
create policy "Admins delete inventory"
on public.inventory for delete
to authenticated
using (public.is_admin());

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.inventory to authenticated;

-- Bikes catalog managed from Admin Dashboard
create table if not exists public.bikes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  quantity integer not null default 0 check (quantity >= 0),
  status text not null default 'in_stock' check (status in ('in_stock','pre_order','out_of_stock','hidden')),
  dealer_price numeric(12,2) not null default 0 check (dealer_price >= 0),
  retail_price numeric(12,2) not null default 0 check (retail_price >= 0),
  image_url text,
  catalog_url text,
  colors text[] not null default '{}',
  featured boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists bikes_set_updated_at on public.bikes;
create trigger bikes_set_updated_at
before update on public.bikes
for each row execute function public.set_updated_at();

alter table public.bikes enable row level security;

drop policy if exists "Public read visible bikes" on public.bikes;
create policy "Public read visible bikes"
on public.bikes for select
to anon, authenticated
using (status <> 'hidden' or public.is_admin());

drop policy if exists "Admins insert bikes" on public.bikes;
create policy "Admins insert bikes"
on public.bikes for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins update bikes" on public.bikes;
create policy "Admins update bikes"
on public.bikes for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins delete bikes" on public.bikes;
create policy "Admins delete bikes"
on public.bikes for delete
to authenticated
using (public.is_admin());

grant select on public.bikes to anon, authenticated;
grant insert, update, delete on public.bikes to authenticated;
