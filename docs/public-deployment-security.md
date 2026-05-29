# Public Deployment Security

Status: implemented baseline for Phase 18 public-deploy hardening.

This page records the assumptions a public RoadForge API deployment must satisfy. Local development keeps the default permissive behavior where noted.

## Runtime mode

Set `ROADFORGE_ENVIRONMENT` to a non-`development` value for public deployments. Outside development, FastAPI docs, ReDoc, and `/api/openapi.json` are disabled.

## Required secret

Set `ROADFORGE_SECRET_KEY` to a non-default value of at least 32 characters outside development. The current implementation uses this as a startup guard for production readiness; it does not rewrite session-token generation.

## Database guard

Public deployments must set a production `DATABASE_URL`. Startup fails outside development when the URL is the local default, points at `localhost`/`127.0.0.1`/`::1`, or uses the obvious development credentials `roadforge:roadforge_dev`.

Only set `ROADFORGE_ALLOW_LOCAL_DATABASE_IN_PRODUCTION=true` for a documented topology where the API and database intentionally share a host-local private network. Do not use it to run the default development database publicly.

## Trusted proxies

By default, RoadForge ignores `X-Forwarded-For` and `X-Real-IP` and rate limits by the immediate peer address. Configure `ROADFORGE_TRUSTED_PROXY_IPS` with comma-separated proxy IPs or CIDR ranges, for example:

```sh
ROADFORGE_TRUSTED_PROXY_IPS=10.0.0.10,10.0.1.0/24
```

When the immediate peer is trusted, RoadForge accepts the first `X-Forwarded-For` address or `X-Real-IP`. Malformed forwarded values are ignored. The reverse proxy should overwrite inbound forwarding headers from clients before forwarding to the API.

## Security headers

The API sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and a conservative `Permissions-Policy`. Sensitive roadmap API responses keep `Cache-Control: no-store`. `Strict-Transport-Security` is sent only when `ROADFORGE_ENVIRONMENT=production`.

SSE responses at `/api/roadmaps/{id}/events` keep their streaming headers and are not forced into `no-store` by the roadmap response rule.

## Rate limiting

App-level rate limiting covers unauthenticated create/join paths, password failures, share-link mutation, SSE ticket creation, manual checkpoints, and authenticated roadmap/share/version/participant/activity/lock reads. Redis-backed rate limits are shared across workers only when `ROADFORGE_REALTIME_BACKEND=redis`; memory-backed limits are single-worker.

## Reverse proxy and HTTPS

Terminate HTTPS at the public edge or reverse proxy and forward only to the API over a private network. Public deployments should use HSTS-capable HTTPS for all browser traffic. Do not expose the API directly behind an untrusted proxy that preserves client-supplied forwarding headers.

## Local development differences

Development mode keeps `/api/docs`, `/api/redoc`, and `/api/openapi.json` enabled, does not require `ROADFORGE_SECRET_KEY`, permits the default local database URL, does not require trusted proxy configuration, and omits HSTS.
