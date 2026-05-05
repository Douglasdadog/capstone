-- WIS Phase 4: Client Ordering UX fields

alter table public.shipments
  add column if not exists client_contact_number text;

alter table public.shipments
  add column if not exists business_name text;

alter table public.shipments
  add column if not exists tin text;

alter table public.shipments
  add column if not exists order_source text not null default 'sales';

create index if not exists shipments_order_source_idx
  on public.shipments(order_source, updated_at desc);
