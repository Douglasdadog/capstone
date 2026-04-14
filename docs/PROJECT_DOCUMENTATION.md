Warehouse Information System (WIS)
Features and Capabilities Documentation

1. Platform Summary

The Warehouse Information System (WIS) is a role-based operations platform that combines inventory management, manifest verification, shipment lifecycle tracking, logistics communication, public shipment tracking, and baseline security hardening.

Main capability groups:
- Identity and access control
- Admin governance and monitoring
- Inventory operations and scanning verification
- Sales logistics and shipment communication
- Public self-service tracking and issue reporting
- Application-level security protections

2. Role-Based Functional Capabilities

2.1 Admin Capabilities
- Access full system dashboard and cross-module visibility.
- Manage user access permissions and route grants.
- Upload manifest files in Excel or CSV format.
- Parse and store manifest rows with required fields:
  - Part Number
  - Quantity
  - Batch ID
- Manage manifest lifecycle statuses:
  - Pending Verification
  - Completed
  - Discrepancies
- Review audit and monitoring sections for operational oversight.

2.2 Inventory Capabilities
- Monitor stock levels, threshold limits, and replenishment alerts.
- Apply manual quantity and threshold overrides.
- Use mobile-ready barcode scanning for manifest verification.
- Track scanned count against expected count per part number.
- Complete verification when all scanned counts match expected values.
- Submit discrepancy reports with category and comments when mismatches occur.

2.3 Sales Capabilities
- Manage shipment status transitions.
- Update logistics metadata per shipment:
  - 3PL Provider Name
  - Waybill/Trucker Number
  - ETA
- Trigger SMTP shipment notification emails automatically when status changes to In Transit.
- Generate secure UUID-based tracking links for no-login client tracking.

2.4 Client Capabilities
- Track shipment progress and status through client-facing tracking interfaces.
- View shipment route and fulfillment progression details.

2.5 Public (No-Login) Capabilities
- Access shipment tracking without login via:
  - Token URL tracking page
  - Tracking-number search page
- View itemized battery shipment details.
- Download digital packing list PDF.
- Submit shipment issues and receive ticket IDs.

3. Authentication and Access Control

- Supabase-backed user registration and login.
- Role-based route authorization enforced in middleware.
- TOTP-based MFA support with QR setup and OTP verification.
- MFA gate applied before protected routes are accessible.
- Public tracking routes are separated from protected internal modules.

4. MFA Capability Details

- After successful password login, users are redirected to OTP verification.
- MFA setup supports first-time QR enrollment.
- OTP verification enables protected route access for authenticated sessions.
- Session state stores MFA verification result per login session.

5. Manifest Management Capabilities

- Accept and process Excel/CSV uploads for manifests.
- Normalize and validate incoming row data.
- Persist manifest headers and manifest line items in relational tables.
- Provide admin-facing status tracking and updates for verification workflows.

6. Inventory Scanning Capabilities

- Retrieve pending manifest for verification.
- Enable camera barcode scanning for item capture.
- Increment and validate scan counters per part number.
- Support mismatch handling with discrepancy categories:
  - Short Shipment
  - Damaged on Arrival
  - Mismatched Part
  - Over-shipment
- Collect additional discrepancy comments for audit context.

7. Logistics and Shipment Communication Capabilities

- Manage shipment status lifecycle and logistics metadata.
- Trigger outbound SMTP email to client on In Transit transition.
- Include shipment context in communication (route, status, tracking details).
- Support secure no-login tracking link generation for each shipment.

8. Public Tracking Portal Capabilities

8.1 Token-Based Tracking
- Access shipment by unique UUID token URL.
- Display shipment summary, ETA, provider and waybill references, and itemized battery rows.
- Provide digital packing list PDF download.
- Allow issue report submission and ticket generation.
- Show thank-you confirmation page with expected response time.

8.2 Tracking Number Search Page
- Public page dedicated to shipment tracking only.
- Search by tracking number.
- Display current status, route, ETA, and itemized shipment details.
- Kept separate from internal logistics dashboard functionality.

9. Security Capabilities Implemented

- API rate limiting for sensitive endpoints.
- Anti-bruteforce delay on failed login and MFA verification attempts.
- Input length and format constraints on exposed auth/public routes.
- Security response headers applied via middleware.
- Public tracking token validation with controlled error responses.
- MFA reset request logging for lost-device scenarios from OTP verification page.

10. Feature Matrix

- Authentication
  - Capability: Supabase login/register and role session handling
  - Primary users: All roles
  - Status: Implemented

- MFA (TOTP)
  - Capability: QR enrollment and OTP-gated protected access
  - Primary users: Admin, Inventory, Sales, Client
  - Status: Implemented

- Admin Permissions
  - Capability: User route grant management
  - Primary users: Admin
  - Status: Implemented

- Manifest Upload and Tracking
  - Capability: Excel/CSV import and verification status lifecycle
  - Primary users: Admin
  - Status: Implemented

- Inventory Operations and Scanning
  - Capability: Stock controls, barcode verification, discrepancy reporting
  - Primary users: Inventory
  - Status: Implemented

- Logistics Management
  - Capability: Shipment metadata, status updates, SMTP notifications
  - Primary users: Sales, Admin
  - Status: Implemented

- Public Tracking
  - Capability: Token tracking, tracking-number search, PDF packing list
  - Primary users: Public, Client
  - Status: Implemented

- Public Issue Ticketing
  - Capability: Issue submission with generated ticket ID and thank-you response page
  - Primary users: Public, Client
  - Status: Implemented

- Security Hardening
  - Capability: Rate limiting, anti-bruteforce controls, security headers
  - Primary users: System-wide
  - Status: Implemented

11. Current Capability Status

All major workflow capabilities for authentication, MFA, manifests, inventory scanning, logistics operations, public tracking, communication triggers, issue ticketing, and baseline hardening are implemented and operational.