# Warehouse Information System (WIS) - Features and Capabilities

## Core Functions

- Role-based warehouse operations platform for Admin, Inventory, Sales, and Client users.
- Real-time inventory and shipment visibility with dashboard modules.
- Public tracking support through secure tokenized links (no login required).

## User Roles and Capabilities

### Admin
- Manage system users and permission access.
- Upload battery shipment manifests via `.xlsx` or `.csv`.
- Monitor and update manifest lifecycle:
  - Pending Verification
  - Completed
  - Discrepancies
- Access system-wide monitoring, logs, and IoT-related dashboard panels.

### Inventory
- View inventory levels, thresholds, and replenishment alerts.
- Use manual quantity/threshold override controls.
- Perform mobile-friendly manifest scanning workflow with camera barcode scanner.
- Track scan counters per battery part against expected manifest quantities.
- Complete verification when counts match.
- Create discrepancy reports when counts do not match.

### Sales
- Manage logistics status updates for shipments.
- Edit logistics metadata:
  - 3PL Provider Name
  - Waybill/Trucker Number
  - ETA
- Trigger automatic SMTP shipment notifications when status changes to In Transit.
- Generate secure UUID-based client tracking links.

### Client
- Track shipment progress within client portal workflows.
- View shipment details and status progression.

## Authentication and Access Control

- Login and registration workflow integrated with Supabase user accounts.
- Multi-Factor Authentication (TOTP) with QR setup and OTP verification.
- Route-level access control enforced through middleware by role and session.
- Logistics route configured as MFA-exempt while still requiring authenticated access.

## Manifest Management Capabilities

- Accept and parse Excel/CSV manifest files with required fields:
  - Part Number
  - Quantity
  - Batch ID
- Store manifest header and itemized rows in database.
- Provide admin status tracking view with visual status indicators.

## Inventory Scanning Capabilities

- Pending manifest fetch for verification workflow.
- Camera-based barcode capture using `html5-qrcode`.
- Live scan counting per part number.
- Mismatch handling with issue classification options:
  - Short Shipment
  - Damaged on Arrival
  - Mismatched Part
  - Over-shipment
- Comment capture for discrepancy context.

## Logistics and Communication Capabilities

- Shipment status updates with communication hooks.
- Automatic outbound email notification on In Transit transition.
- Tracking-link generation for client self-service shipment monitoring.

## Public Client Tracking Portal Capabilities

- Public access only through unique UUID token URL.
- Displays:
  - Order summary
  - Itemized battery list
  - ETA
  - Logistics references (provider/waybill where available)
- Digital packing list PDF download.
- Issue reporting form with ticket generation (e.g. `#552`).
- Thank-you confirmation page with 24-hour expected response notice.

## Security Capabilities Implemented

- Baseline API request throttling for sensitive endpoints.
- Anti-bruteforce delay controls on failed auth/MFA attempts.
- Input constraints for abuse reduction on sensitive public/auth routes.
- Security response headers applied via middleware.
- Public token validation checks on tracking APIs.

## Current Capability Status

- Authentication, MFA, manifests, scanning, logistics, communication, public tracking, issue ticketing, and baseline hardening are implemented and operational.

## Feature Matrix (Presentation Format)

| Module | Key Features | Primary User Role | Status |
|---|---|---|---|
| Authentication | Login, Register, Role-based session handling | All roles | Implemented |
| MFA (TOTP) | QR setup, OTP verification, protected route gating | Admin, Inventory, Sales, Client | Implemented |
| Admin Permissions | User permissions management and route grants | Admin | Implemented |
| Manifest Upload | Upload `.xlsx/.csv`, parse and save manifest rows | Admin | Implemented |
| Manifest Tracking | Pending/Completed/Discrepancies status management | Admin | Implemented |
| Inventory Monitoring | Inventory table, thresholds, alerts, manual override | Inventory, Admin | Implemented |
| Mobile Scanning | Camera barcode scan, part counters, completion checks | Inventory | Implemented |
| Discrepancy Reporting | Quick-select issue types and comments | Inventory | Implemented |
| Logistics Management | 3PL provider, waybill/trucker number, ETA updates | Sales, Admin | Implemented |
| Shipment Communication | SMTP trigger on In Transit status updates | Sales, Admin | Implemented |
| Tracking Link Generator | Secure UUID no-login client tracking links | Sales, Admin | Implemented |
| Public Tracking Portal | Itemized order summary, ETA, status display | Public/Client | Implemented |
| Packing List Export | Digital packing list PDF download | Public/Client | Implemented |
| Public Issue Ticketing | Delayed/Incorrect/Inquiry issue form + ticket ID | Public/Client | Implemented |
| Security Hardening | Rate limiting, anti-bruteforce delay, security headers | System-wide | Implemented |