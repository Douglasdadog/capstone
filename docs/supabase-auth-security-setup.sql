create table if not exists public.mfa_reset_requests (
  id bigserial primary key,
  user_name text,
  email text not null,
  supabase_user_id uuid,
  role text not null,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);

alter table public.mfa_reset_requests add column if not exists user_name text;
alter table public.mfa_reset_requests add column if not exists supabase_user_id uuid;
alter table public.mfa_reset_requests add column if not exists status text not null default 'Pending';

create index if not exists mfa_reset_requests_email_idx on public.mfa_reset_requests(email);
create index if not exists mfa_reset_requests_status_idx on public.mfa_reset_requests(status);
