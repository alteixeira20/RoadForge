# Public Deployment Security

Status: implemented baseline for Phase 18 public-deploy hardening.

This page records the assumptions a public Anvilary Roadmaps API deployment must satisfy. Local development keeps the default permissive behavior where noted.

The legacy `ROADFORGE_*` environment variable prefix, the `roadforge`/`roadforge_dev` database defaults, and the `roadforge-*` Docker service names are retained for compatibility and are unchanged by the rebrand.

## Runtime mode

Set `ROADFORGE_ENVIRONMENT` to a non-`development` value for public deployments. Outside development, FastAPI docs, ReDoc, and `/api/openapi.json` are disabled.

## Required secret

Set `ROADFORGE_SECRET_KEY` to a non-default value of at least 32 characters outside development. The current implementation uses this as a startup guard for production readiness; it does not rewrite session-token generation.

## Database guard

Public deployments must set a production `DATABASE_URL`. Startup fails outside development when the URL is the local default, points at `localhost`/`127.0.0.1`/`::1`, or uses the obvious development credentials `roadforge:roadforge_dev`.

Only set `ROADFORGE_ALLOW_LOCAL_DATABASE_IN_PRODUCTION=true` for a documented topology where the API and database intentionally share a host-local private network. Do not use it to run the default development database publicly.

## Trusted proxies

By default, Anvilary Roadmaps ignores `X-Forwarded-For` and `X-Real-IP` and rate limits by the immediate peer address. Configure `ROADFORGE_TRUSTED_PROXY_IPS` with comma-separated proxy IPs or CIDR ranges, for example:

```sh
ROADFORGE_TRUSTED_PROXY_IPS=10.0.0.10,10.0.1.0/24
```

When the immediate peer is trusted, Anvilary Roadmaps accepts the first `X-Forwarded-For` address or `X-Real-IP`. Malformed forwarded values are ignored. The reverse proxy should overwrite inbound forwarding headers from clients before forwarding to the API.

Wildcard networks such as `0.0.0.0/0` and `::/0` are rejected. Use only the
specific proxy address or narrow private network range required by the deployment.

## Security headers

The API sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and a conservative `Permissions-Policy`. Sensitive roadmap API responses keep `Cache-Control: no-store`. `Strict-Transport-Security` is sent only when `ROADFORGE_ENVIRONMENT=production`.

SSE responses at `/api/roadmaps/{id}/events` keep their streaming headers and are not forced into `no-store` by the roadmap response rule.

## Rate limiting

Main app-level and service-level rate limits include:

| Action | Limit | Window | Scope |
|---|---|---|---|
| `roadmap.create.ip` (unauthenticated) | 10 | 3600 s | IP |
| `join.ip` (unauthenticated) | 20 | 60 s | IP |
| `join.share_link` | 30 | 600 s | share link |
| `join.password_failure.ip_share` | 5 | 600 s | IP + share link |
| `join.password_failure.share` | 30 | 600 s | share link |
| `roadmap.read` | 240 | 60 s | participant |
| `roadmap.update` | 60 | 60 s | participant |
| `task.done.patch` | 120 | 60 s | participant |
| `roadmap.delete` | 10 | 60 s | participant |
| `share_links.read` | 60 | 60 s | participant |
| `share_link.rotate` | 5 | 60 s | participant |
| `share_link.revoke` | 10 | 60 s | participant |
| `versions.read` | 120 | 60 s | participant |
| `versions.checkpoint` | 10 | 60 s | participant |
| `version.read` | 120 | 60 s | participant |
| `versions.restore` | 10 | 60 s | participant |
| `participants.read` | 120 | 60 s | participant |
| `participants.revoke` | 10 | 60 s | participant |
| `events.ticket.participant` | 10 | 60 s | participant |
| `events.ticket.ip` | 60 | 60 s | IP |
| `locks.acquire` | 120 | 60 s | participant |
| `locks.release` | 120 | 60 s | participant |
| `locks.read` | 120 | 60 s | participant |
| `activity.read` | 120 | 60 s | participant |

Participant-scoped limits use a `{participant_id}:{roadmap_id}` key. IP-scoped limits use the resolved client IP. Redis-backed rate limits are shared across workers only when `ROADFORGE_REALTIME_BACKEND=redis`; memory-backed limits are single-worker.

## Database migrations and deployment ordering

The `hosting-bay` Compose file starts the API after Postgres is healthy, but it
does **not** run migrations automatically.  If a deployment includes schema
changes, the API may fail requests with database errors until migrations are
applied.

Current operator workflow:

1. Deploy the new API image (`docker compose up -d --build roadforge-api`).
2. Wait for the container to be healthy (`make api-health` or watch
   `docker compose ps`).
3. Apply migrations: `make migrate` (or
   `docker compose exec roadforge-api alembic upgrade head`).

If the API starts before migrations complete, it will return 500 errors on any
route that touches a new or changed table.  Restart the API container after
migrations if needed.

A dedicated migration job/container is a future hardening step; for the current
single-operator self-hosted topology, the manual sequence above is the expected
workflow.

## Relational projection rollout

`roadmaps.snapshot_json` remains canonical. The relational roadmap projection
tables are derivative and can be rebuilt from the snapshot.

For deployments that include projection schema or mapper changes:

1. Apply database migrations.
2. Run projection backfill:
   `docker compose exec roadforge-api python -m api.scripts.backfill_projection --verify`
3. Confirm the command reports zero drift/errors before enabling
   `ROADFORGE_ROADMAP_PROJECTION_READ_ENABLED=true`.

The projection-read flag is disabled by default. If enabled and parity or
projection serialization fails for a roadmap, the API falls back to
`roadmaps.snapshot_json` and logs a warning.

## Reverse proxy and HTTPS

Terminate HTTPS at the public edge or reverse proxy and forward only to the API over a private network. Public deployments should use HSTS-capable HTTPS for all browser traffic. Do not expose the API directly behind an untrusted proxy that preserves client-supplied forwarding headers.

## Local development differences

Development mode keeps `/api/docs`, `/api/redoc`, and `/api/openapi.json` enabled, does not require `ROADFORGE_SECRET_KEY`, permits the default local database URL, does not require trusted proxy configuration, and omits HSTS.
