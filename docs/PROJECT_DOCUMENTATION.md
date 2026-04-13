# Warehouse Information System (WIS) - Project Documentation

## 1) Overview

This project is a role-based Warehouse Information System built with Next.js and Supabase.
It supports Admin, Inventory, Sales, and Client workflows including:

- Authentication with role-based access control
- MFA using TOTP (QR setup + OTP verification)
- Inventory monitoring and manual override
- Manifest upload and verification workflows
- Logistics management with client communications
- Public UUID-based tracking portal with issue reporting

---

## 2) Tech Stack

- Frontend: Next.js (App Router), React, Tailwind CSS
- Backend/API: Next.js API Routes
- Database/Auth: Supabase (PostgreSQL + Auth)
- Charts/UI libs: Recharts, Lucide
- Barcode scanning: `html5-qrcode`
- File parsing: `xlsx`
- Email: Nodemailer SMTP (with Resend fallback still available in codebase)
- PDF generation: `pdf-lib`
- MFA: `otplib`

---

## 3) Role Access Model

- **Admin**
  - Full dashboard visibility
  - User permissions
  - Manifest upload/status tracking
  - Global logistics oversight
- **Inventory**
  - Inventory operations
  - Manifest scanning and discrepancy reporting
- **Sales**
  - Logistics status updates
  - 3PL metadata updates
  - Tracking link generation
- **Client**
  - Shipment tracking for own account

Public users can access `/track/[token]` only via secure UUID tracking links.

---

## 4) Authentication and MFA

### Login/Register
- API routes:
  - `/api/auth/demo-login`
  - `/api/auth/demo-register`
- Registered users are created in Supabase Auth.

### MFA Flow (TOTP)
- Login succeeds -> user is redirected to `/verify-otp`.
- MFA APIs:
  - `/api/auth/mfa/status`
  - `/api/auth/mfa/setup`
  - `/api/auth/mfa/verify`
- QR setup provided for Google Authenticator-compatible apps.
- Middleware enforces MFA before protected routes are accessible.

---

## 5) Manifest Upload and Verification

### Admin Upload
- UI: `Admin Manifest Manager` in `admin` module.
- Upload accepts `.xlsx` and `.csv`.
- Required columns:
  - Part Number
  - Quantity
  - Batch ID
- API: `/api/admin/manifests` (POST/GET)
- Initial status on upload: **Pending Verification**

### Status Tracking
- Admin can update status:
  - Pending Verification
  - Completed
  - Discrepancies
- API: `/api/admin/manifests/[id]` (PATCH)

---

## 6) Inventory Scanning Module

### Mobile Scanning
- Route: `/inventory/scanning`
- Fetches oldest pending manifest.
- Camera barcode scanning via `html5-qrcode`.
- Per-part counters track scanned count vs expected count.

### Completion and Reporting
- If counts match -> Complete verification.
- If mismatch -> “Make Report” flow:
  - Route: `/inventory/scanning/report`
  - Quick-select reasons:
    - Short Shipment
    - Damaged on Arrival
    - Mismatched Part
    - Over-shipment
  - Optional comments
- APIs:
  - `/api/inventory/manifests/pending`
  - `/api/inventory/manifests/[id]/complete`
  - `/api/inventory/manifests/[id]/report`

---

## 7) Logistics Management Module

### Sales Logistics Fields
Each shipment now supports:
- 3PL Provider Name
- Waybill/Trucker Number
- ETA

### Status and Email Trigger
- When Sales/Admin sets status to **In Transit**, an SMTP email is triggered to client.
- API: `/api/logistics/update-status`

### Tracking Link Generator
- Secure UUID link generation for no-login client tracking:
  - API: `/api/logistics/generate-tracking-link`
  - Public URL format: `/track/[token]`

---

## 8) Public Client Tracking Portal

### Public Portal
- Route: `/track/[token]`
- No login required.
- Token must be valid UUID stored in shipment record.

### Displayed Information
- Shipment summary and current status
- ETA
- Itemized battery list

### Digital Packing List
- PDF download endpoint:
  - `/api/public/tracking/[token]/packing-list`

### Report Issue
- Embedded form with options:
  - Delayed Shipment
  - Incorrect Status
  - Order Inquiry
- API:
  - `/api/public/tracking/[token]/issue`
- Generates ticket ID (e.g. `#552`) and redirects to:
  - `/track/[token]/thank-you`
- SLA shown: response within 24 hours.

---

## 9) Database Setup Scripts

Run these in Supabase SQL Editor:

- `docs/supabase-inventory-setup.sql`
- `docs/supabase-logistics-setup.sql`
- `docs/supabase-manifest-setup.sql`

Notes:
- Logistics SQL is idempotent and safe to re-run.
- Realtime publication checks are guarded to avoid duplicate membership errors.

---

## 10) Environment Variables

Typical required keys:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MAIL_FROM`
- SMTP keys for transport:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`

Optional:
- `RESEND_API_KEY`
- `WIS_IOT_HEALTH_URL`

---

## 11) Build and Deploy

### Local
- `npm install`
- `npm run build`
- `npm run dev`

### Production
- Push to GitHub
- Deploy via Vercel:
  - `npx vercel --prod --yes`

---

## 12) Current Status

Core modules for authentication, MFA, manifests, inventory scanning, logistics, and public tracking are implemented and build-clean.

