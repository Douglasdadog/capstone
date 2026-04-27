-- WIS Supabase PostgreSQL Security Hardening (Production)
-- Run in Supabase SQL Editor as project owner.
--
-- IMPORTANT:
-- 1) This script enforces strict database access (RLS + revoke table access from anon/authenticated).
-- 2) Server routes using service_role keep working.
-- 3) Direct browser table access/realtime subscriptions using anon key will be blocked after this.
--    (Current app should rely on server APIs for data plane in production.)

begin;

-- ---------------------------------------------------------------------------
-- 0) Baseline safety
-- ---------------------------------------------------------------------------

-- Keep public schema usage explicit.
grant usage on schema public to anon, authenticated;

-- Revoke broad/default table privileges from low-privilege roles.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Ensure future objects are also locked down by default.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1) Enforce Row Level Security on business tables
-- ---------------------------------------------------------------------------

alter table if exists public.inventory enable row level security;
alter table if exists public.auto_replenishment_alerts enable row level security;
alter table if exists public.sensor_logs enable row level security;
alter table if exists public.sensor_alert_notifications enable row level security;
alter table if exists public.sensor_alert_config enable row level security;
alter table if exists public.scanner_access_tokens enable row level security;
alter table if exists public.manifests enable row level security;
alter table if exists public.manifest_items enable row level security;
alter table if exists public.manifest_scan_events enable row level security;
alter table if exists public.manifest_reports enable row level security;
alter table if exists public.shipments enable row level security;
alter table if exists public.shipment_items enable row level security;
alter table if exists public.tracking_issues enable row level security;
alter table if exists public.mfa_reset_requests enable row level security;
alter table if exists public.idempotency_keys enable row level security;

-- Force RLS so even table owners are constrained unless explicitly bypassed.
alter table if exists public.inventory force row level security;
alter table if exists public.auto_replenishment_alerts force row level security;
alter table if exists public.sensor_logs force row level security;
alter table if exists public.sensor_alert_notifications force row level security;
alter table if exists public.sensor_alert_config force row level security;
alter table if exists public.scanner_access_tokens force row level security;
alter table if exists public.manifests force row level security;
alter table if exists public.manifest_items force row level security;
alter table if exists public.manifest_scan_events force row level security;
alter table if exists public.manifest_reports force row level security;
alter table if exists public.shipments force row level security;
alter table if exists public.shipment_items force row level security;
alter table if exists public.tracking_issues force row level security;
alter table if exists public.mfa_reset_requests force row level security;
alter table if exists public.idempotency_keys force row level security;

-- ---------------------------------------------------------------------------
-- 2) Explicit deny policies for anon/authenticated roles
--    (No policy = deny by default once RLS is enabled, but we define these to
--     make intent obvious during audits/pentests.)
-- ---------------------------------------------------------------------------

drop policy if exists deny_inventory_all on public.inventory;
create policy deny_inventory_all on public.inventory for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_auto_replenishment_alerts_all on public.auto_replenishment_alerts;
create policy deny_auto_replenishment_alerts_all on public.auto_replenishment_alerts for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_sensor_logs_all on public.sensor_logs;
create policy deny_sensor_logs_all on public.sensor_logs for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_sensor_alert_notifications_all on public.sensor_alert_notifications;
create policy deny_sensor_alert_notifications_all on public.sensor_alert_notifications for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_sensor_alert_config_all on public.sensor_alert_config;
create policy deny_sensor_alert_config_all on public.sensor_alert_config for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_scanner_access_tokens_all on public.scanner_access_tokens;
create policy deny_scanner_access_tokens_all on public.scanner_access_tokens for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_manifests_all on public.manifests;
create policy deny_manifests_all on public.manifests for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_manifest_items_all on public.manifest_items;
create policy deny_manifest_items_all on public.manifest_items for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_manifest_scan_events_all on public.manifest_scan_events;
create policy deny_manifest_scan_events_all on public.manifest_scan_events for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_manifest_reports_all on public.manifest_reports;
create policy deny_manifest_reports_all on public.manifest_reports for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_shipments_all on public.shipments;
create policy deny_shipments_all on public.shipments for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_shipment_items_all on public.shipment_items;
create policy deny_shipment_items_all on public.shipment_items for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_tracking_issues_all on public.tracking_issues;
create policy deny_tracking_issues_all on public.tracking_issues for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_mfa_reset_requests_all on public.mfa_reset_requests;
create policy deny_mfa_reset_requests_all on public.mfa_reset_requests for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_idempotency_keys_all on public.idempotency_keys;
create policy deny_idempotency_keys_all on public.idempotency_keys for all to anon, authenticated using (false) with check (false);

-- ---------------------------------------------------------------------------
-- 3) Security helper function hygiene
-- ---------------------------------------------------------------------------

-- Ensure every SECURITY DEFINER function resolves objects from known schemas.
-- (Run this query to inspect any unsafe definitions manually.)
-- select n.nspname as schema_name, p.proname as function_name
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where p.prosecdef = true
--   and n.nspname = 'public';

commit;

-- ---------------------------------------------------------------------------
-- Post-apply verification checklist (run manually):
-- 1) select relname, relrowsecurity, relforcerowsecurity from pg_class where relname in (...);
-- 2) confirm app server APIs still work (service_role paths).
-- 3) confirm direct anon/authenticated table reads are blocked.
-- ---------------------------------------------------------------------------
