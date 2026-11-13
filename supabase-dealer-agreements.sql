-- RFN Dealer Agreement archive. Run in Supabase SQL Editor before deployment.
create table if not exists public.dealer_agreement_acceptances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dealer_name text not null,
  contact_person text not null,
  contact_title text,
  email text not null,
  phone text not null,
  address text not null,
  agreement_id text not null,
  agreement_sha256 text not null,
  accepted_at timestamptz not null default now(),
  pdf_path text not null,
  created_at timestamptz not null default now()
);
alter table public.dealer_agreement_acceptances enable row level security;
revoke all on public.dealer_agreement_acceptances from anon, authenticated;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('dealer-agreements','dealer-agreements',false,10485760,array['application/pdf'])
on conflict (id) do update set public=false;
-- No public storage policies. Netlify server functions use service role credentials.
