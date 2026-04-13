-- Logistics Shipments table
create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  tracking_number text not null unique,
  client_name text not null,
  client_email text not null,
  origin text not null,
  destination text not null,
  item_name text,
  quantity integer,
  provider_name text,
  waybill_number text,
  eta timestamptz,
  tracking_token uuid unique,
  status text not null check (status in ('Pending', 'In Transit', 'Delivered')) default 'Pending',
  updated_at timestamptz not null default now()
);

alter table public.shipments add column if not exists provider_name text;
alter table public.shipments add column if not exists waybill_number text;
alter table public.shipments add column if not exists eta timestamptz;
alter table public.shipments add column if not exists tracking_token uuid;
alter table public.shipments add column if not exists item_name text;
alter table public.shipments add column if not exists quantity integer;
create unique index if not exists shipments_tracking_token_idx on public.shipments(tracking_token);

create table if not exists public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  part_number text not null,
  quantity integer not null check (quantity > 0),
  batch_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.tracking_issues (
  id bigserial primary key,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  issue_type text not null check (issue_type in ('Delayed Shipment', 'Incorrect Status', 'Order Inquiry')),
  message text,
  contact_email text,
  created_at timestamptz not null default now()
);

create index if not exists shipment_items_shipment_id_idx on public.shipment_items(shipment_id);
create index if not exists tracking_issues_shipment_id_idx on public.tracking_issues(shipment_id);

-- Seed sample shipments (maps to demo client account)
insert into public.shipments (tracking_number, client_name, client_email, origin, destination, status)
values
  ('WIS-1001', 'Demo Client', 'client@wis.local', 'Manila DC', 'Cebu Hub', 'Pending'),
  ('WIS-1002', 'Demo Client', 'client@wis.local', 'Laguna Warehouse', 'Davao Hub', 'In Transit'),
  ('WIS-1003', 'Demo Client', 'client@wis.local', 'Pampanga DC', 'Iloilo Hub', 'Delivered')
on conflict (tracking_number) do nothing;

-- Enable realtime updates
do $$
begin
  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'shipments'
  ) then
    alter publication supabase_realtime add table public.shipments;
  end if;
end $$;
