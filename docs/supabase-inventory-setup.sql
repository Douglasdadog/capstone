-- Inventory table
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'Maintenance Free',
  name text not null,
  image_url text,
  quantity integer not null default 0,
  threshold_limit integer not null default 5,
  updated_at timestamptz not null default now()
);

-- Ensure category column exists for older databases
alter table public.inventory
add column if not exists category text not null default 'Maintenance Free';

alter table public.inventory
add column if not exists image_url text;

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
insert into public.inventory (category, name, image_url, quantity, threshold_limit)
values
  -- Evvo batteries - Maintenance Free (8 products)
  ('Maintenance Free', 'Evvo Battery MF 2SM', 'https://placehold.co/320x200/fef3c7/92400e?text=Evvo+Battery+MF+2SM', 24, 10),
  ('Maintenance Free', 'Evvo Battery MF 3SM', 'https://placehold.co/320x200/fef3c7/92400e?text=Evvo+Battery+MF+3SM', 20, 9),
  ('Maintenance Free', 'Evvo Battery MF 4SM', 'https://placehold.co/320x200/fef3c7/92400e?text=Evvo+Battery+MF+4SM', 18, 8),
  ('Maintenance Free', 'Evvo Battery MF 24', 'https://placehold.co/320x200/fef3c7/92400e?text=Evvo+Battery+MF+24', 15, 7),
  ('Maintenance Free', 'Evvo Battery MF 27', 'https://placehold.co/320x200/fef3c7/92400e?text=Evvo+Battery+MF+27', 13, 6),
  ('Maintenance Free', 'Evvo Battery MF 35', 'https://placehold.co/320x200/fef3c7/92400e?text=Evvo+Battery+MF+35', 11, 5),
  ('Maintenance Free', 'Evvo Battery MF 40', 'https://placehold.co/320x200/fef3c7/92400e?text=Evvo+Battery+MF+40', 10, 5),
  ('Maintenance Free', 'Evvo Battery MF 55D23', 'https://placehold.co/320x200/fef3c7/92400e?text=Evvo+Battery+MF+55D23', 9, 4),
  -- D-Zel King - Conventional (6 products)
  ('Conventional', 'D-Zel King Battery N40', 'https://placehold.co/320x200/e2e8f0/334155?text=D-Zel+King+Battery+N40', 22, 10),
  ('Conventional', 'D-Zel King Battery N50', 'https://placehold.co/320x200/e2e8f0/334155?text=D-Zel+King+Battery+N50', 17, 8),
  ('Conventional', 'D-Zel King Battery N70', 'https://placehold.co/320x200/e2e8f0/334155?text=D-Zel+King+Battery+N70', 14, 7),
  ('Conventional', 'D-Zel King Battery N100', 'https://placehold.co/320x200/e2e8f0/334155?text=D-Zel+King+Battery+N100', 12, 6),
  ('Conventional', 'D-Zel King Battery N120', 'https://placehold.co/320x200/e2e8f0/334155?text=D-Zel+King+Battery+N120', 9, 5),
  ('Conventional', 'D-Zel King Battery N150', 'https://placehold.co/320x200/e2e8f0/334155?text=D-Zel+King+Battery+N150', 7, 4)
on conflict do nothing;

-- Enable realtime updates
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory'
  ) then
    alter publication supabase_realtime add table public.inventory;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'auto_replenishment_alerts'
  ) then
    alter publication supabase_realtime add table public.auto_replenishment_alerts;
  end if;
end
$$;
