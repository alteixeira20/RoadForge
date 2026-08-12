# Rate Limiting Policy

Status: implemented security contract.

Related policies:

- [Session expiry and revocation](./session-expiry-and-revocation-policy.md)
- [Public deployment security](../public-deployment-security.md)

## Purpose

RoadForge is accountless, so abuse controls cannot rely on a global user identity. The API
uses action-specific fixed-window limits keyed by the strongest non-secret server-side
identity available for the operation: trusted client IP, roadmap/share-link identity, or
participant identity.

Rate limiting reduces brute-force/password guessing, roadmap-creation spam, repeated SSE
ticket churn, and abusive authenticated operations. It is not a replacement for
server-authoritative authorization, revocation/expiry, or edge volumetric protection.

## Current limits

The route/service code is authoritative for exact values. The maintained baseline includes:

| Action | Primary dimension | Baseline |
| --- | --- | ---: |
| Join attempts | trusted client IP | 20/minute |
| Valid invite joins | share-link identity | 30/10 minutes |
| Failed password attempts | trusted client IP + roadmap/link | 5/10 minutes |
| Failed password attempts | roadmap/link | 30/hour |
| Roadmap creation | trusted client IP | 10/hour |
| Event-ticket requests | participant + roadmap | 10/minute |
| Event-ticket requests | trusted client IP + roadmap | 60/minute |
| Share-link rotation | owner + roadmap + role | 5/minute |
| Share-link revocation | owner + roadmap + role | 10/minute |

Other authenticated write/recovery actions also use participant/action buckets where the
router defines them. Do not add one broad global bucket in place of action-specific limits:
that would make unrelated normal collaboration interfere with itself.

A normal exhausted bucket returns `429 Too Many Requests`, a generic FastAPI-style detail,
and `Retry-After`. Responses must not reveal whether a guessed invite exists or whether a
password was close/correct.

## Storage backends

### Memory mode

`ROADFORGE_REALTIME_BACKEND=memory` uses an in-process limiter. It is appropriate only for
the maintained one-worker memory topology. Counters reset on process restart and are not
shared between processes.

### Redis mode

`ROADFORGE_REALTIME_BACKEND=redis` uses Redis fixed-window counters with TTLs. The same Redis
backend coordinates realtime events, locks, single-use event tickets, revocation state, and
rate limits across workers/instances.

**Redis rate-limit checks fail closed.** If Redis cannot execute the rate-limit operation,
RoadForge returns `503 Service Unavailable` with `Retry-After: 1` rather than silently
allowing the request. This is intentional: in a public multi-worker deployment, permitting
all requests when the shared abuse-control dependency fails would remove an expected
security boundary exactly when the system is degraded.

Readiness separately reports required Redis availability for configured Redis deployments.
Operators should investigate dependency health rather than changing the limiter to fail
open.

## Limiter keys and credential handling

Raw secrets must never become limiter keys or log fields.

- Unknown/public join attempts use the trusted client IP and server-derived non-reversible
  token identity where appropriate.
- After invite lookup, use internal share-link/roadmap identity rather than the raw invite.
- Authenticated limits use participant IDs or server-side token hashes, not the Bearer value.
- Password-failure buckets use roadmap/share-link and trusted client dimensions without
  storing the password.
- Display names, assignees, roadmap names, and browser-local identifiers are not identities
  and must not be rate-limit dimensions.

Rate-limit logs may include action names and non-secret fingerprints. They must not include
raw invite/session/event-ticket tokens, passwords, Authorization headers, cookies, full join
URLs, or request bodies.

## Trusted client IP

Client-IP limits are security-relevant only if forwarded headers come from a trusted proxy.
RoadForge uses the direct peer unless it is inside `ROADFORGE_TRUSTED_PROXY_IPS`; only then
may configured forwarded client-address headers influence the effective client IP.

Production rejects catch-all trusted-proxy networks. The API must not trust arbitrary
client-supplied `X-Forwarded-For`, `X-Real-IP`, or Cloudflare-style headers from an untrusted
peer.

NAT means several legitimate collaborators can share one IP. The baseline limits therefore
allow short bursts and combine IP dimensions with roadmap/share-link/participant dimensions
rather than treating IP as identity.

## Interaction with authentication and sessions

Rate limiting does not change the access model:

- invalid/expired/revoked participant sessions still fail authentication/authorization;
- participant revocation remains immediate and separate from rate limiting;
- invite rotation/revocation blocks future joins but does not invalidate already joined
  participants;
- a revoked participant can rejoin through a still-active invite only by going through the
  normal join/password rate limits;
- browser HttpOnly session cookies and explicit API/MCP Bearer sessions are limited using the
  same server-authoritative participant identity after authentication.

## Edge controls

Cloudflare, nginx, host firewalls, and platform networking may add coarse volumetric/IP
protection. They do not replace application limits because the edge cannot safely key by
participant or share-link identity and must not inspect/store raw RoadForge credentials.

External edge rate limits must be tuned so they do not accidentally defeat legitimate
accountless collaboration behind shared NATs.

## Failure and monitoring behavior

Expected limiter outcomes:

- exhausted valid bucket → `429` + `Retry-After`;
- Redis limiter unavailable in Redis mode → `503` + `Retry-After: 1`;
- memory mode process restart → in-process counters reset;
- API dependency/readiness failure remains a separate health signal.

Repeated `503` from limiter availability is an operational incident. Repeated `429` may be
normal abuse protection or a tuning signal. Observe action names and aggregate counts without
collecting credentials/private roadmap content.

## Change rule

Any change to a public/security-sensitive limit, trusted-client-IP extraction, Redis failure
mode, or limiter key composition requires focused tests and a security review. In particular,
changing Redis behavior back to fail-open is a security-boundary relaxation and must not be
made as an availability shortcut.
