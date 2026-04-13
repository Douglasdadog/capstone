# Security Hardening Guide (WIS)

## Objective

This document summarizes implemented security controls and recommended next steps to improve resilience against common penetration testing vectors such as SQL injection, brute-force attacks, traffic interception, reconnaissance scans, and high-volume abuse.

---

## Implemented Controls

## 1) Input Validation and Safer Query Patterns

- API handlers validate required fields and reject invalid values early.
- Length guards were added to reduce payload abuse and oversized input vectors.
- Supabase query builder is used instead of raw SQL string concatenation for API data operations.

**Coverage focus:**
- Auth login/register routes
- MFA verification route
- Public tracking issue submission route

---

## 2) Rate Limiting (Application Layer)

- Added in-memory rate limiting utility:
  - `lib/security/rate-limit.ts`
- Applied per-IP limits on sensitive endpoints:
  - `/api/auth/demo-login`
  - `/api/auth/demo-register`
  - `/api/auth/mfa/verify`
  - `/api/public/tracking/[token]/issue`

These return HTTP `429` with `Retry-After` when exceeded.

---

## 3) Brute-Force Friction

- Added small artificial delay on authentication failures (`delayOnFailure`) to slow automated credential stuffing attempts.
- Combined with rate limiting, this reduces rapid brute-force velocity.

---

## 4) Security Headers (Middleware)

The middleware now applies security headers on responses:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(self), microphone=(), geolocation=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `Strict-Transport-Security` (production only)

These help harden browser behavior against clickjacking, MIME confusion, and insecure transport fallback.

---

## 5) Public Tracking Token Access Model

- Public shipment tracking is accessible only by UUID token URL (`/track/[token]`).
- Backend validates token existence before returning shipment data.
- Invalid/expired tokens receive non-success responses without exposing internal details.

---

## Pen-Test Vector Mapping

## SQLi / sqlmap

Current status:
- Improved defensive posture due to validation and query builder use.
- No direct raw SQL concatenation in public-facing endpoints touched by recent modules.

Remaining best practices:
- Keep avoiding raw SQL string interpolation.
- Add centralized schema validators (e.g., zod) on all write endpoints.

## Brute Force

Current status:
- Rate limiting + failure delay in auth/MFA routes added.

Remaining best practices:
- Account lockout/cooldown policy by account identifier.
- CAPTCHA/challenge for repeated failures.

## DDoS

Current status:
- App-level endpoint throttling added.

Important:
- Real DDoS mitigation is primarily infrastructure-level (Vercel edge + optional WAF).

Recommended:
- Enable Cloudflare or equivalent WAF/rate-limit rules.
- Configure edge bot mitigation and anomaly detection.

## Wireshark Traffic Sniffing

Current status:
- HTTPS/TLS transport assumed in production deployment.
- HSTS header added in production middleware responses.

Recommended:
- Ensure Vercel custom domain always enforces HTTPS redirects.

## Nmap / Reconnaissance

Current status:
- Deployed behind managed hosting edge, reducing direct host/service exposure.

Recommended:
- Use managed firewall/WAF policies.
- Minimize endpoint metadata leakage and verbose error messages.

---

## Operational Recommendations (Next Phase)

1. Move rate limiting to distributed storage (Redis/Upstash) to support horizontal scaling.
2. Add account-based lockout tracking (email + IP hybrid strategy).
3. Introduce centralized structured security logs (auth failures, token abuse, suspicious bursts).
4. Add CI security scanning:
   - dependency audit
   - static analysis
5. Define incident response playbook (containment, rotation, notification).
6. Run periodic external pentest and patch cycle.

---

## Verification Checklist

- [x] Build passes after hardening changes
- [x] Lint diagnostics clean for modified files
- [ ] Cloud WAF/rules configured
- [ ] Distributed rate limiter configured
- [ ] Security monitoring dashboard enabled

