# Public deployment security

This document describes the security contract of the current RoadForge runtime.
It is an operator reference, not a future design document.

RoadForge `0.1.0` can be self-hosted, but the Anvilary-hosted instance is a demo and
convenience deployment rather than a managed data-storage service. Users should keep
portable JSON exports of important roadmaps.

## Production mode

Set:

```sh
ROADFORGE_ENVIRONMENT=production
```

Production mode disables FastAPI interactive documentation/OpenAPI routes and enables
the production security-header path. RoadForge intentionally has no generic
application secret setting: add a secret only when a concrete cryptographic feature
actually consumes it.

## Database guard

Production must use an explicit `DATABASE_URL`. Startup rejects the repository's
local development database configuration and unsafe localhost/default credential
combinations unless the operator explicitly acknowledges a documented host-local
production topology with:

```sh
ROADFORGE_ALLOW_LOCAL_DATABASE_IN_PRODUCTION=true
```

Do not use that override merely to bypass a failed deployment check.

## Cross-origin access

`ROADFORGE_CORS_ORIGINS` must contain explicit `scheme://host[:port]` origins.
Production startup rejects empty, malformed, and wildcard origins.

RoadForge uses bearer participant credentials rather than authentication cookies.
That removes cookie-oriented CSRF assumptions; it does not reduce the need to protect
bearer tokens and restrict origins.

## Trusted proxies and client addresses

RoadForge ignores `X-Forwarded-For` and `X-Real-IP` unless the immediate peer is
within `ROADFORGE_TRUSTED_PROXY_IPS`.

Configure the narrowest proxy address or CIDR and make the proxy replace—not append
untrusted client-provided forwarding headers. Catch-all networks such as `0.0.0.0/0`
and `::/0` are rejected.

## Credential-safe logging

Owner/editor invite links are credentials. Viewer links grant read access. Participant
session tokens are bearer credentials.

The FastAPI access log records method, path, and status without query strings,
headers, request bodies, or full request URLs. The maintained self-hosted nginx
configuration also omits query strings and `Referer` from access logs.

Operators must separately review:

- reverse-proxy error logs;
- tunnel/CDN/provider logs;
- load balancer logs;
- shell history;
- support attachments;
- retained logs created before safe formats were configured.

Never place participant session tokens in URLs.

## Content Security Policy

The frontend CSP is **report-only** for `0.1.0`. This is an explicit residual risk,
not an enforcement claim. Participant credentials live in browser storage, so script
injection remains consequential.

Do not switch the header to enforcement by adding broad `unsafe-inline` exceptions.
The enforcement path requires a tested nonce/hash design compatible with Next.js
hydration and all supported RoadForge flows. This work is tracked separately.

## Request-body limits

The browser import path, API request middleware, and maintained nginx configuration
use the same roadmap payload ceiling:

```text
5 MiB
```

The authoritative API constant is `REQUEST_BODY_MAX_BYTES` in
`apps/api/src/api/schemas/limits.py`. Documentation must not reintroduce historical
512 KiB limits.

## Rate limiting

RoadForge applies action-specific limits to creates, joins/password failures,
authenticated reads/writes, sharing, versions, participants, event tickets, locks,
activity, and tag operations.

Memory-backed limits are process-local. When multiple API workers or instances are
used, configure:

```sh
ROADFORGE_REALTIME_BACKEND=redis
REDIS_URL=redis://...
```

Redis mode shares event coordination, locks, tickets, revocation state, and rate
limits. RoadForge refuses multiple configured workers with the memory backend.
Operators must also avoid running multiple independent one-worker memory instances.

## Health contract

The health endpoints have one authoritative meaning:

| Endpoint | Meaning |
| --- | --- |
| `GET /api/health/live` | Process liveness only; no external dependency checks |
| `GET /api/health/ready` | PostgreSQL and configured Redis readiness |
| `GET /api/health` | Backward-compatible alias for readiness |

A `503` from `/api/health` or `/api/health/ready` means a required dependency is not
ready; it does not by itself prove that the API process is dead.

Use readiness for Docker/orchestration traffic checks. Use `/live` only when a true
process-liveness probe is required.

## Realtime topology

- `ROADFORGE_REALTIME_BACKEND=memory` supports one API process.
- `ROADFORGE_REALTIME_BACKEND=redis` is required for multi-worker/multi-instance operation.
- Redis must remain on private/protected networks and must not be publicly exposed.
- Redis connection credentials, when present in `REDIS_URL`, must never be logged.

Roadmap state remains PostgreSQL-backed; realtime delivery is not the data source of
truth.

## Database migrations and projection

Every deployment must migrate to the current Alembic head:

```sh
make migrate
```

or use the maintained update path:

```sh
make update
```

Take a PostgreSQL backup before schema-sensitive deployment. Alembic downgrade is not
the generic rollback plan.

`roadmaps.snapshot_json` remains canonical for the phase/task tree. Relational
projection reads are optional and disabled by default. Before enabling them, verify
projection parity from the canonical snapshot.

## Containers and network exposure

The maintained API and web production images run as non-root users. Public deployments
must:

- terminate HTTPS at a trusted edge;
- keep PostgreSQL and Redis off public networks;
- expose the API only through intended proxy/private paths;
- use non-development database credentials;
- configure explicit CORS and trusted proxies;
- retain backups outside the repository and database volume.

Do not expose `next dev`, FastAPI development servers, PostgreSQL, or Redis directly to
the public Internet.

## Data deletion and retention

Roadmap deletion is currently soft deletion. A final operator-enforced retention and
hard-purge policy is tracked separately. Until that work lands, do not promise users
that a delete action immediately removes every server-side historical record or backup.

Public copy should distinguish:

- deleting a browser-local roadmap;
- soft-deleting a synced roadmap;
- final server/backup retention.

## Release proof

A public release/deployment requires more than a green unit-test suite. Require:

- exact-candidate CI success;
- migration and dependency checks;
- production container validation;
- independent owner/editor/viewer browser contexts;
- revoke, conflict, realtime, import/export, and recovery checks;
- confirmation that proxy logs do not record invite query strings;
- backup/restore evidence for schema-sensitive releases.

See [Manual QA](manual-qa.md), [Senior readiness audit](senior-readiness-audit.md),
and [Self-hosting](self-hosting.md).
