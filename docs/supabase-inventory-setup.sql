-- Inventory table
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quantity integer not null default 0,
  threshold_limit integer not null default 5,
  updated_at timestamptz not null default now()
);

-- Auto replenishment log table
create table if not exists public.auto_replenishment_alerts (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  item_name text not null,
  reading_quantity integer not null,
  threshold_limit integer not null,
  status text not null default 'triggered',
  message text not null,
  created_at timestamptz not null default now()
);

-- Seed sample inventory rows
insert into public.inventory (name, quantity, threshold_limit)
values
  ('Industrial Bolts', 26, 10),
  ('Hydraulic Pump', 8, 5),
  ('Forklift Battery', 4, 3),
  ('Pallet Wrap Roll', 19, 8)
on conflict do nothing;

-- Enable realtime updates
alter publication supabase_realtime add table public.inventory;
alter publication supabase_realtime add table public.auto_replenishment_alerts;
