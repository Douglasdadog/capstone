-- WIS Phase 2 Hardening
-- 1) Payment rejection metadata
-- 2) Transaction-safe inventory release RPC

alter table public.shipments
  add column if not exists payment_rejected_at timestamptz;

alter table public.shipments
  add column if not exists payment_rejection_reason text;

create or replace function public.wis_release_shipment_inventory(p_shipment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  shipment_row record;
  grouped_item record;
  updated_item record;
begin
  select id, inventory_deducted_at
  into shipment_row
  from public.shipments
  where id = p_shipment_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Shipment not found.');
  end if;

  if shipment_row.inventory_deducted_at is not null then
    return jsonb_build_object('ok', true, 'alreadyReleased', true);
  end if;

  for grouped_item in
    select part_number as item_name, sum(quantity)::int as required_qty
    from public.shipment_items
    where shipment_id = p_shipment_id
    group by part_number
  loop
    update public.inventory
    set quantity = quantity - grouped_item.required_qty,
        updated_at = now()
    where name = grouped_item.item_name
      and quantity >= grouped_item.required_qty
    returning id, name, quantity, threshold_limit
    into updated_item;

    if not found then
      return jsonb_build_object(
        'ok', false,
        'error',
        format('Insufficient stock or missing item for %s.', grouped_item.item_name)
      );
    end if;

    if updated_item.quantity < updated_item.threshold_limit then
      insert into public.auto_replenishment_alerts (
        inventory_id,
        item_name,
        reading_quantity,
        threshold_limit,
        status,
        message
      ) values (
        updated_item.id,
        updated_item.name,
        updated_item.quantity,
        updated_item.threshold_limit,
        'triggered',
        format('Low stock alert triggered for %s', updated_item.name)
      );
    end if;
  end loop;

  update public.shipments
  set inventory_deducted_at = now()
  where id = p_shipment_id
    and inventory_deducted_at is null;

  return jsonb_build_object('ok', true, 'alreadyReleased', false);
end;
$$;
