# Security Documentation

See also: [SECURITY.md](../../SECURITY.md) — public-facing responsible disclosure policy.

RoadForge is accountless and local-first. There is no user credential database, no OAuth, and no email verification. Access is controlled by role-scoped invite tokens, optional roadmap passwords, and participant session tokens stored in browser `localStorage`. Security work in this project focuses on protecting those tokens, limiting abuse of public-facing endpoints, controlling browser-side attack surface, and keeping dependencies free of known high-severity vulnerabilities.

The documents below are a mix of policy (intended behavior) and implementation notes (current behavior). Each document's status line indicates which it is.

---

## Session and auth

**[Session Expiry and Revocation Policy](./session-expiry-and-revocation-policy.md)**

Covers the participant session model, proposed 30-day sliding expiry, session revocation via the owner Team panel, share-link revocation vs. participant revocation, and how the local roadmap cache is preserved across session expiry. Status: implemented — backend expiry enforcement and frontend session handling are in place; deployment and manual QA may be separate steps.

---

## Rate limiting

**[Rate Limiting Policy](./rate-limiting-policy.md)**

Covers threat model for token brute-force, password guessing, roadmap creation spam, and event-ticket abuse. Defines recommended per-action limits, key dimensions (client IP, share-link identity, participant ID), storage strategy (in-memory first, Redis later), error response shape, and interaction with the session expiry policy. Status: implemented — app-level rate limiter with Redis-capable storage is in place; deployment and manual QA may be separate steps.

---

## Headers and CSP

**[Security Headers Policy](./security-headers-policy.md)**

Covers the headers currently set by Next.js (`next.config.ts`) and Nginx (`roadforge.conf`), the deferred Content Security Policy (CSP), and recommended header values for `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`. Explains why XSS is particularly sensitive given that bearer session tokens live in `localStorage`. Status: implemented — baseline security headers and report-only CSP are active; enforcement mode and further hardening may be staged separately.

---

## Public deployments

**[Public Deployment Security](../public-deployment-security.md)**

Documents required production settings, disabled OpenAPI docs outside development, trusted proxy IP handling, unsafe database guards, API security headers, rate limiting assumptions, reverse proxy expectations, and local development differences. Status: implemented baseline.

---

## Dependency audits

**[Dependency Audit Policy](./dependency-audit-policy.md)**

Covers the JS audit (`pnpm audit --audit-level high --prod`) and Python audit gates that run in CI on every push and PR. Documents the current advisory status, known moderate findings and their mitigations, and the threshold at which findings block merges. Status: implemented — CI gates are active.

---

## Notes

- These docs describe implemented behavior. Deployment and manual QA steps may still be pending for some features.
- Docs marked as "implemented" or with an active CI status describe current runtime or CI behavior.
- When in doubt, read the source: `apps/api/src/api/` for backend behavior and `apps/web/next.config.ts` for frontend header configuration.
