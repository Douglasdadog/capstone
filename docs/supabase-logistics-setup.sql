-- Logistics Shipments table
create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  tracking_number text not null unique,
  client_name text not null,
  client_email text not null,
  origin text not null,
  destination text not null,
  status text not null check (status in ('Pending', 'In Transit', 'Delivered')) default 'Pending',
  updated_at timestamptz not null default now()
);

-- Seed sample shipments (maps to demo client account)
insert into public.shipments (tracking_number, client_name, client_email, origin, destination, status)
values
  ('WIS-1001', 'Demo Client', 'client@wis.local', 'Manila DC', 'Cebu Hub', 'Pending'),
  ('WIS-1002', 'Demo Client', 'client@wis.local', 'Laguna Warehouse', 'Davao Hub', 'In Transit'),
  ('WIS-1003', 'Demo Client', 'client@wis.local', 'Pampanga DC', 'Iloilo Hub', 'Delivered')
on conflict (tracking_number) do nothing;

-- Enable realtime updates
alter publication supabase_realtime add table public.shipments;
