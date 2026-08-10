# Self-hosting RoadForge

This is the supported `0.1.0` self-hosting contract. Exact Compose commands and
environment examples live in [`deploy/self-hosted/README.md`](../deploy/self-hosted/README.md).
Security requirements live in [Public deployment security](public-deployment-security.md).

The Anvilary-hosted RoadForge instance is a demo/convenience deployment. Self-hosting
is the option for operators who want to control server persistence, backups, retention,
and infrastructure. Roadmap users should still keep portable JSON exports of important
work.

## Supported topology

A production-oriented deployment consists of:

- Next.js web application;
- FastAPI API;
- PostgreSQL 16;
- optional Redis for shared realtime coordination;
- an HTTPS reverse proxy or trusted edge.

Use the maintained files under `deploy/self-hosted/`. Do not expose development servers,
PostgreSQL, or Redis directly to the public Internet.

## Before first deployment

Create a deployment `.env` from the maintained example and review every value.
At minimum, configure:

- production PostgreSQL password/connection;
- `ROADFORGE_ENVIRONMENT=production`;
- `ROADFORGE_WEB_BASE_URL`;
- explicit `ROADFORGE_CORS_ORIGINS`;
- narrow `ROADFORGE_TRUSTED_PROXY_IPS`;
- realtime backend and Redis URL when required.

Run the deployment doctor/config validation documented under `deploy/self-hosted` before
starting the public stack.

## Deployment sequence

Use this order for first deploys and schema-sensitive updates:

1. Back up PostgreSQL if an existing deployment is being changed.
2. Build/pull the exact candidate revision.
3. Start PostgreSQL and Redis, when Redis is configured.
4. Apply `alembic upgrade head` through the maintained migration command.
5. Verify/backfill relational projections when required by the release.
6. Start the API.
7. Start the web application and HTTPS proxy.
8. Verify health endpoints.
9. Exercise create, save, share, join, realtime, import/export, and conflict recovery.

The maintained update path is:

```bash
cd /opt/stacks/roadforge/src
make update
```

Do not replace `alembic upgrade head` with a release-specific migration filename.

## Health checks

Use the endpoints according to their actual runtime semantics:

```text
/api/health/live   process liveness only
/api/health/ready  PostgreSQL + configured Redis readiness
/api/health        backward-compatible readiness alias
```

For normal deployment readiness checks, use `/api/health/ready` or `/api/health`.
A `503` means a required dependency is unavailable even if the API process itself is
still running.

## Realtime modes

### Memory

```sh
ROADFORGE_REALTIME_BACKEND=memory
ROADFORGE_API_WORKERS=1
```

Memory mode is a **single-process** topology. Do not run multiple independent API
instances in this mode merely because each has one worker.

### Redis

Use Redis for multiple API workers or instances:

```sh
ROADFORGE_REALTIME_BACKEND=redis
REDIS_URL=redis://...
```

Redis coordinates SSE publication, edit locks, one-time event tickets, revocation
state, and rate limits. Keep Redis private and do not log its connection URL when it
contains credentials.

## Access and credentials

RoadForge has no account/login system. Shared roadmaps use role-scoped invite links,
optional roadmap passwords, and participant session tokens.

- Owner/editor invite URLs are sensitive credentials.
- Viewer URLs grant read access and should still be treated as access-bearing links.
- Invite rotation controls future joins; existing participant sessions are revoked separately.
- Participant session tokens belong in `Authorization: Bearer ...`, never in URLs.
- Do not paste invite/session tokens into shell commands, tickets, public issues, screenshots, or logs.

## Request size

The maintained browser, API, and nginx roadmap payload limit is **5 MiB**. The API
constant is defined in `apps/api/src/api/schemas/limits.py`.

If an operator changes proxy limits, they must remain compatible with the application
limit rather than silently creating a smaller upstream ceiling.

## Backups

PostgreSQL is the durable source for synced roadmaps. Before every schema-sensitive
release:

1. create a PostgreSQL custom-format dump;
2. verify the dump is non-empty;
3. record a checksum;
4. copy the backup outside the repository and database volume;
5. periodically perform a disposable restore drill.

The complete command sequence is maintained in
[`deploy/self-hosted/README.md`](../deploy/self-hosted/README.md). Do not duplicate a
live database merely to test restore. Restore into a uniquely named disposable database,
verify representative domain rows and projection parity, then remove only that database.

An untested backup is not a recovery plan.

## Rollback

Application rollback and database rollback are different operations.

- Re-deploying a previous API/web image does not undo an already-applied migration.
- Alembic downgrade is unsupported unless a specific migration explicitly documents it.
- For a schema incident, use the pre-migration database backup and a known-good application revision.
- Test recovery in a disposable environment before modifying the live database whenever possible.

## Credential-safe logs

RoadForge application access logs omit query strings, headers, and request bodies. The
maintained nginx access format omits query strings and `Referer`.

Upstream infrastructure may still retain full request targets. Review proxy/tunnel/CDN
logging separately because invite tokens can appear in join URLs.

Use service-specific log commands from `deploy/self-hosted/README.md` rather than
copying private data into public reports.

## Incident triage

When the deployment is unavailable, check in this order:

1. `/api/health/live` — is the API process responding?
2. `/api/health/ready` — are PostgreSQL and configured Redis ready?
3. `docker compose ... ps` — which service is unhealthy/restarting?
4. reverse proxy/TLS/tunnel status;
5. Redis connectivity when Redis mode is enabled;
6. PostgreSQL connectivity and migration state;
7. API/web/database/Redis logs as appropriate;
8. last known-good backup and rollback candidate.

Do not treat a readiness failure as proof that the API process is dead, and do not
repair projection drift by modifying canonical roadmap snapshots manually.

## Content Security Policy

RoadForge `0.1.0` ships a report-only frontend CSP. This is a known security boundary.
Do not enable enforcement by adding broad inline-script exceptions. A future enforced
policy must use a tested nonce/hash strategy compatible with the production Next.js
runtime.

## Data retention

Roadmap deletion is soft-only until the tracked retention/purge work lands. Operators
must not promise immediate hard deletion from all server records or backups.

Define backup retention independently and document it for any public deployment.

## Release verification

Before exposing or updating a public instance:

```bash
make release-check
```

Then require green exact-head GitHub Actions and perform the deployed checks in
[Manual QA](manual-qa.md). In particular verify independent owner/editor/viewer
contexts, revocation, conflicts, realtime recovery, JSON export/import, and safe proxy
logging.
