# RoadForge security documentation

This directory contains the maintained security contracts and release evidence requirements for RoadForge.

Start here:

- [Internet-facing security audit — 2026-08-12](./internet-facing-audit-2026-08-12.md) — consolidated threat model and first Internet-facing hardening pass.
- [Post-hardening Internet-facing audit — 2026-08-12](./post-hardening-audit-2026-08-12.md) — follow-up resource-exhaustion, production-origin and SSE lifecycle findings/remediations.
- [Session expiry and revocation policy](./session-expiry-and-revocation-policy.md) — participant sessions, HttpOnly browser cookies, legacy migration, revocation, and realtime credential handling.
- [Rate limiting policy](./rate-limiting-policy.md) — action-specific limits, trusted client IPs, Redis coordination, and fail-closed behavior.
- [Security headers and CSP](./security-headers-policy.md) — nonce CSP, header ownership, browser compatibility boundaries, and observation/rollback rules.
- [Dependency audit policy](./dependency-audit-policy.md) — JavaScript/Python audit gates and the narrow exception process.
- [Operational proof gate](./operational-proof-gate.md) — exact-candidate CI plus deployed/manual evidence required before public release.

Broader deployment/access references:

- [Public deployment security](../public-deployment-security.md)
- [Self-hosting](../self-hosting.md)
- [Access model](../access-model.md)
- [Backend API reference](../backend-api.md)
- [Manual QA](../manual-qa.md)
- [Repository security policy](../../SECURITY.md)

## Maintenance rule

Security documentation must describe implemented behavior, not aspirational design. When an authentication, credential-transport, CSP, rate-limit, dependency, proxy, or deployment contract changes, update the relevant policy and focused regression tests in the same candidate.

Do not publish raw invite/session/event-ticket credentials, passwords, Authorization/cookie values, private roadmap contents, or unredacted browser/network logs as security evidence.
