create table if not exists public.manifests (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  uploaded_by text not null,
  status text not null default 'Pending Verification' check (status in ('Pending Verification', 'Completed', 'Discrepancies')),
  discrepancy_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.manifest_items (
  id uuid primary key default gen_random_uuid(),
  manifest_id uuid not null references public.manifests(id) on delete cascade,
  part_number text not null,
  quantity integer not null check (quantity > 0),
  batch_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.manifest_reports (
  id uuid primary key default gen_random_uuid(),
  manifest_id uuid not null references public.manifests(id) on delete cascade,
  reported_by text not null,
  reason text not null check (reason in ('Short Shipment', 'Damaged on Arrival', 'Mismatched Part', 'Over-shipment')),
  comments text,
  created_at timestamptz not null default now()
);

create index if not exists manifests_status_idx on public.manifests(status);
create index if not exists manifest_items_manifest_id_idx on public.manifest_items(manifest_id);
create index if not exists manifest_reports_manifest_id_idx on public.manifest_reports(manifest_id);

-- Realtime: notify Inventory / Admin when a new manifest row is inserted
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
      and c.relname = 'manifests'
  ) then
    alter publication supabase_realtime add table public.manifests;
  end if;
end $$;
