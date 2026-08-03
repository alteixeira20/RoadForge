# Public Deployment Security

This page records the controls a public RoadForge deployment must satisfy. It
covers the repository's current behavior, not hypothetical protections.

## Runtime mode

Set `ROADFORGE_ENVIRONMENT=production` for public deployments. Production mode
disables FastAPI docs, ReDoc, and `/api/openapi.json`, and enables production
security headers.

RoadForge does not require a generic application secret. Session and invite
credentials are generated as random opaque tokens and only their hashes are
stored. Do not add a placeholder secret unless a future feature actually uses it
for signing, encryption, or keyed hashing.

## Database guard

Set a production `DATABASE_URL`. Startup fails outside development when the URL
uses the repository's local default, obvious development credentials, or a
localhost address without an explicit override.

Only set `ROADFORGE_ALLOW_LOCAL_DATABASE_IN_PRODUCTION=true` for a documented
topology where the API and database intentionally communicate through a private
host-local network.

## Trusted proxies

RoadForge ignores `X-Forwarded-For` and `X-Real-IP` unless the immediate peer is
listed in `ROADFORGE_TRUSTED_PROXY_IPS`. Configure only the reverse proxy IP or
the narrowest required CIDR:

```sh
ROADFORGE_TRUSTED_PROXY_IPS=10.0.0.10,10.0.1.0/24
```

The reverse proxy must replace client-supplied forwarding headers. Wildcard
networks such as `0.0.0.0/0` and `::/0` are rejected.

## Cross-origin configuration

Set `ROADFORGE_CORS_ORIGINS` to an explicit comma-separated list of
`scheme://host[:port]` origins. Production startup rejects empty, malformed, and
wildcard origins.

RoadForge uses bearer session tokens and one-time SSE tickets, not cookies.
Authenticated credentials are never attached automatically by the browser, so
the API does not use cookie-oriented CSRF controls. Token confidentiality and
strict origin configuration remain mandatory.

## Security headers and credential-safe logging

The API sets conservative content, framing, referrer, permissions, and cache
headers. HSTS is enabled only in production and should also be enforced at the
public HTTPS edge.

Join tokens and SSE tickets can appear in URLs. Application access logs omit
query strings. The supplied nginx format also omits query strings and `Referer`.
Review retained old logs and upstream provider logs separately.

The frontend Content Security Policy remains report-only during pre-release.
Move it to enforcement only after a production-build browser pass confirms that
all required application flows work without violations.

## Rate limiting

RoadForge rate limits unauthenticated creates and joins, password failures,
roadmap reads and writes, sharing operations, version operations, participants,
SSE tickets, locks, and activity reads. Participant limits include both the
participant and roadmap ID. IP limits use the address resolved through the
trusted-proxy policy.

Memory-backed limits apply to one API process. Redis-backed limits are shared
across workers. Multi-worker API deployments therefore require
`ROADFORGE_REALTIME_BACKEND=redis` and a working `REDIS_URL`.

## Migrations and deployment ordering

The self-hosted update path must apply every migration, not a named historical
migration:

```sh
make update
# or, for an already running stack
make migrate
```

`make update` pulls with fast-forward-only semantics, rebuilds, starts the new
containers, and runs `alembic upgrade head`. Do not interrupt the update between
container startup and migration completion. Take a PostgreSQL backup before
schema-sensitive releases because application rollback does not automatically
reverse migrations.

## Relational projection

`roadmaps.snapshot_json` remains canonical. Relational projection tables are
derivative and projection reads are disabled by default. Do not enable
`ROADFORGE_ROADMAP_PROJECTION_READ_ENABLED` until a backfill and verification
reports no drift:

```sh
docker compose exec roadforge-api \
  python -m api.scripts.backfill_projection --verify
```

If projection serialization fails while reads are enabled, RoadForge falls back
to the canonical snapshot and logs a warning.

## Reverse proxy and health checks

Terminate HTTPS at a trusted edge and expose the API only through private
container or host networking. Do not trust forwarding headers from arbitrary
peers.

`GET /api/health` is a liveness check only. It does not prove PostgreSQL, Redis,
realtime propagation, migrations, or the web application are healthy. Validate
dependencies and complete the browser collaboration flow after each release.

## Local development differences

Development mode keeps API documentation enabled, permits the local database
default, omits production HSTS, and uses explicit localhost CORS origins. It does
not relax roadmap authorization or token handling.
