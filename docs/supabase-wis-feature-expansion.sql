-- WIS Feature Expansion (Audit + Client Module + Payment Workflow + Milestones)

-- 1) System-wide activity logs
create table if not exists public.system_activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  actor_name text not null,
  actor_role text,
  actor_ip text,
  action text not null,
  target_module text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists system_activity_logs_created_at_idx
  on public.system_activity_logs(created_at desc);

create index if not exists system_activity_logs_actor_email_idx
  on public.system_activity_logs(actor_email);

create index if not exists system_activity_logs_module_idx
  on public.system_activity_logs(target_module, created_at desc);

-- 2) Shipment lifecycle expansion
alter table public.shipments
  add column if not exists milestone_status text not null default 'Pending';

alter table public.shipments
  add column if not exists payment_status text not null default 'Awaiting Payment';

alter table public.shipments
  add column if not exists payment_proof_url text;

alter table public.shipments
  add column if not exists payment_proof_uploaded_at timestamptz;

alter table public.shipments
  add column if not exists payment_verified_at timestamptz;

alter table public.shipments
  add column if not exists inventory_deducted_at timestamptz;

alter table public.shipments
  add column if not exists approved_released_by text;

alter table public.shipments
  add column if not exists approved_released_at timestamptz;

alter table public.shipments
  add column if not exists assigned_client_name text;

alter table public.shipments
  add column if not exists assigned_client_email text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shipments_milestone_status_check'
  ) then
    alter table public.shipments
      add constraint shipments_milestone_status_check
      check (milestone_status in ('Pending', 'In Transit', 'Delivered'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shipments_payment_status_check'
  ) then
    alter table public.shipments
      add constraint shipments_payment_status_check
      check (payment_status in ('Awaiting Payment', 'Submitted', 'Verified', 'Rejected'));
  end if;
end $$;

create index if not exists shipments_client_email_updated_idx
  on public.shipments(client_email, updated_at desc);

create index if not exists shipments_assigned_client_email_idx
  on public.shipments(assigned_client_email);

create index if not exists shipments_milestone_status_idx
  on public.shipments(milestone_status, updated_at desc);

create index if not exists shipments_payment_status_idx
  on public.shipments(payment_status, updated_at desc);
