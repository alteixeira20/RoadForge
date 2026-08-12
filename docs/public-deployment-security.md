# Public deployment security

This document describes the current RoadForge runtime security contract. It is an operator
reference, not a future design document.

The Anvilary-hosted instance remains a demo/convenience deployment rather than a managed
backup service. Users should keep portable JSON exports of important roadmaps.

## Production mode

Set:

```sh
ROADFORGE_ENVIRONMENT=production
```

Production disables FastAPI interactive docs/OpenAPI, enables production security headers,
requires explicit deployment origins/proxies, and makes browser session/event-ticket cookies
`Secure`.

RoadForge intentionally has no generic application-secret setting. Add a secret only when a
concrete cryptographic feature consumes it.

## Database guard

Production must use an explicit `DATABASE_URL`. Startup rejects the repository's local
development database configuration and unsafe localhost/default credential combinations
unless the operator explicitly acknowledges the documented host-local topology. Do not use
that override simply to bypass a failed deployment check.

## Browser origins, cookies, and CSRF

`ROADFORGE_CORS_ORIGINS` must contain explicit `scheme://host[:port]` origins. Production
startup rejects empty, malformed, and wildcard origins.

The browser exchanges a new participant Bearer for a roadmap-path-scoped HttpOnly,
`SameSite=Strict` session cookie. Cookie-authenticated `POST`, `PUT`, `PATCH`, and `DELETE`
requests additionally require an `Origin` that exactly matches the configured CORS allow
list. Explicit API/MCP Bearer requests remain a separate path and are not mixed with ambient
cookies.

Do not relax SameSite, cookie path scoping, Secure production cookies, or exact-Origin checks
to accommodate a cross-site topology without an architecture/security review.

## Invite and realtime credential transport

Generated owner/editor/viewer invites use `/join#token=...`; fragments are not sent in HTTP
request targets and the join page removes the credential from the active history entry after
bootstrap. Legacy `?token=` invite links are migration-only compatibility and should be
rotated after deployment.

SSE uses a 30-second single-use roadmap/participant-scoped event ticket delivered through a
path-scoped HttpOnly cookie. The EventSource URL contains no ticket or participant session.

## Trusted proxies and client addresses

RoadForge ignores forwarded client-address headers unless the immediate peer is inside
`ROADFORGE_TRUSTED_PROXY_IPS`. Configure the narrowest proxy address/CIDR. Catch-all networks
such as `0.0.0.0/0` and `::/0` are rejected.

The proxy must replace rather than trust arbitrary client-supplied forwarding headers.

## Credential-safe logging

The FastAPI access log records method, path, status, duration, and client IP without query
strings, headers, bodies, cookies, or full URLs. The maintained nginx format logs `$uri`
rather than `$request_uri` and omits Referer.

Operators must separately review reverse-proxy error logs, Cloudflare/tunnel/CDN logs, host
journals, shell history, support attachments, and retained pre-hardening logs. Those systems
are outside this repository.

Never log or publish raw invite tokens, participant sessions, event tickets, passwords,
Authorization headers, cookies, database/Redis credentials, or private roadmap exports.

## Content Security Policy

Production uses an enforced nonce-based CSP. Executable production scripts do not receive
`unsafe-inline` or `unsafe-eval`; HTML is no-store so nonces are not cached across document
responses. nginx/Cloudflare must preserve the application CSP and must not inject a
conflicting second policy.

`style-src 'unsafe-inline'` remains an explicit compatibility boundary for current dynamic
React style attributes; it does not relax script execution.

A bounded report-only observation window is supported after meaningful runtime/frontend
changes, but enforced production browser CI remains the release baseline.

## Request-body and input limits

The browser import path, API body middleware, and maintained nginx configuration share a
5 MiB roadmap payload ceiling. The API body limiter counts actual streamed bytes, so a
missing or dishonest `Content-Length` does not bypass the limit.

Pydantic/domain validation imposes additional field/count limits. Task external links are
normalized and credential-like query parameters are rejected before persistence.

## Rate limiting

RoadForge applies action-specific limits to public and authenticated operations. Memory
limits are process-local. Multi-worker/multi-instance realtime requires Redis so rate-limit,
realtime, lock, ticket, and revocation coordination is shared.

Redis-backed rate limiting fails closed with `503` when Redis cannot perform the check; it
does not silently allow the request.

## Health contract

| Endpoint | Meaning |
| --- | --- |
| `GET /api/health/live` | process liveness only |
| `GET /api/health/ready` | PostgreSQL and configured Redis readiness |
| `GET /api/health` | backward-compatible readiness alias |

A readiness `503` means a required dependency is unavailable. It does not necessarily mean
the Python process is dead.

## Realtime topology

- `ROADFORGE_REALTIME_BACKEND=memory` supports one API process.
- Redis is required for multiple workers/instances.
- Redis and PostgreSQL remain private/internal services.
- Realtime state is not the roadmap source of truth; PostgreSQL remains authoritative.

## Database migrations

Every deployment must migrate to current Alembic head through `make migrate` or `make update`.
Take a verified PostgreSQL backup before schema-sensitive deployment. Application rollback
does not automatically downgrade schema.

The internet-hardening migration `0011` deactivates legacy viewer links whose raw token was
persisted, clears the old raw material, and drops `share_links.public_token`. Rotate the
viewer link after upgrade when a new copyable viewer invite is required.

## Containers and network exposure

Production web/API images run non-root. The maintained Compose file further uses read-only
root filesystems, capability drops, no-new-privileges, PID ceilings, and narrowly scoped
tmpfs write areas where compatible. PostgreSQL and Redis retain only the writable runtime
paths they require.

Public deployments must terminate HTTPS at a trusted edge, keep PostgreSQL/Redis off public
networks, expose the app only through intended proxy paths, use non-development credentials,
and retain backups outside the repository/database volume.

Do not expose `next dev`, development FastAPI servers, PostgreSQL, or Redis directly to the
Internet.

## Supply-chain contract

Maintained GitHub Actions are pinned to immutable upstream commit SHAs and workflows use
read-only repository permissions for normal validation. JavaScript/Python dependency audits,
production container builds, migration drift checks, MCP checks, and production browser CSP
checks are release gates.

The repository does not claim that CI alone proves a deployed Cloudflare/nginx host is safe;
operator edge/runtime validation remains required.

## Data deletion and retention

Roadmap deletion and final purge/backup retention are separate lifecycle stages. The current
retention tooling and policy define when live soft-deleted records may be permanently purged;
backup copies remain governed by their independent expiry schedule.

## Release proof

A public deployment requires exact-candidate CI plus deployed checks for create/save,
owner/editor/viewer joins, browser-session migration, participant revocation, invite rotation,
realtime, conflicts, import/export, enforced CSP/no duplicate edge CSP, safe logging, and
backup/rollback readiness.

See [Self-hosting](../deploy/self-hosted/README.md), [Manual QA](manual-qa.md),
[Access model](access-model.md), and [Security documentation](security/README.md).
