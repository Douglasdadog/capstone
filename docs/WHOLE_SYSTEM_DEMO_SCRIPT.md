# WIS Whole-System Demo Script

## 0) Pre-demo setup (5 minutes)
- Start the app and confirm Supabase is connected.
- Prepare 4 accounts: `superadmin`, `admin`, `inventory`, `sales` (plus optional client/public view).
- Make sure at least 1 manifest and several inventory items exist.
- Keep one browser window for internal users and one incognito window for public tracking.

## 1) Security and login flow (3-5 minutes)
1. Open `/login` and sign in as `admin`.
2. Show OTP gate redirect to `/verify-otp`.
3. Complete MFA verification and enter dashboard.
4. Explain that protected pages are inaccessible until OTP is verified.

## 2) Admin governance flow (5-7 minutes)
1. In dashboard, show system overview cards and audit entries.
2. Open user/permissions management and grant/revoke a sample route.
3. Open security requests panel and show MFA reset request statuses.
4. Point out privileged action audit trail entries for governance.

## 3) Inventory operations flow (7-10 minutes)
1. Switch to `inventory` role view.
2. Open inventory page and show:
- stock quantity
- threshold limits
- low stock alert panel
3. Use **Simulate IoT Trigger** (or reduce quantity) to force low stock.
4. Confirm new entry appears as: **"Low stock alert triggered for <item>"**.
5. Show manual override (quantity/threshold) and refresh behavior.

## 4) Manifest + scanning flow (5-8 minutes)
1. Upload a manifest (CSV/XLSX) from admin/inventory flow.
2. Open phone scanner link/QR and scan sample serials.
3. Show expected vs scanned counts update in real time.
4. Submit a discrepancy report (if mismatch) and show saved report trail.

## 5) Sales + logistics flow (5-8 minutes)
1. Switch to `sales` role.
2. Create a shipment/order with destination, provider, waybill, and items.
3. Update status from `Pending` to `In Transit`.
4. Highlight SMTP notification trigger behavior.
5. Show tracking number and generated public token link.

## 6) Public tracking flow (4-6 minutes)
1. In incognito, open token link `/track/<token>`.
2. Show shipment timeline/details without login.
3. Use tracking-number search page for no-login lookup.
4. Submit issue ticket and show thank-you confirmation page.

## 7) Wrap-up talking points (2 minutes)
- End-to-end flow is role-based and module-connected.
- Security controls active: MFA, rate limiting, role checks, audit visibility.
- Inventory-to-logistics continuity: low stock alerts, fulfillment, public tracking.
- Governance ready: privileged trail, security requests, operational transparency.

## Optional backup demo path (if live data is limited)
- Use sensor simulation for low-stock alert generation.
- Use one pre-created shipment to demonstrate public tracking quickly.
- Use one pending manifest to demonstrate scanning without file prep.
