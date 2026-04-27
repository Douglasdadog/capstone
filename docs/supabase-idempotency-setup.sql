-- Idempotency keys for offline queue replay safety.
-- Run once in Supabase SQL editor.

create table if not exists public.idempotency_keys (
  idempotency_key text primary key,
  scope text not null,
  status text not null default 'processing' check (status in ('processing', 'completed')),
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_idempotency_keys_scope_created_at
  on public.idempotency_keys (scope, created_at desc);
