# Self-hosting RoadForge

This deployment is the maintained **reference self-hosted topology** for RoadForge. The
public Anvilary instance at `roadforge.anvilary.tools` is a hosted demo/reference deployment;
teams that depend on RoadForge operationally—especially larger teams—should fork the
repository or maintain a controlled clone and run infrastructure they control.

This stack targets `roadforge.anvilary.tools` as the reference hostname with Docker Compose,
PostgreSQL, optional Redis-backed realtime, a central nginx proxy, and a Cloudflare Tunnel.
Adapt the hostname, network, capacity, backup, monitoring, and edge configuration to your own
deployment.

The reference stack is production-oriented, but it is **not** a claim that RoadForge has been
capacity-certified for an arbitrary team size. Operators are responsible for sizing and
load-testing their expected concurrency/data volume, defining recovery objectives, and
monitoring the deployed service. See
[`docs/hosted-demo-and-self-hosting.md`](../../docs/hosted-demo-and-self-hosting.md).

Expected paths for this reference deployment:

- repository: `/opt/stacks/roadforge/src`
- private environment file: `/opt/stacks/roadforge/.env`
- persistent PostgreSQL data: `/opt/data/apps/roadforge/postgres`
- central nginx configuration: `/opt/data/proxy/nginx/conf.d`

RoadForge is public by default. Invite links provide roadmap-scoped access; Cloudflare
Access is not part of the standard product flow.

## Before using RoadForge for a team

The public demo is suitable for evaluation and light collaboration. If RoadForge becomes part
of a team's real workflow, keep the deployment under team control. For a larger or sustained
deployment, the operator should explicitly own:

- the fork/clone and deployed revision;
- PostgreSQL durability, backup/restore, and retention;
- Redis availability when using multiple API workers/instances;
- CPU, memory, storage, database connection, proxy, and SSE capacity;
- monitoring, alerting, log retention, incident response, and rollback;
- representative load testing before depending on the service.

Forking/self-hosting remains subject to the repository's current PolyForm Noncommercial
License 1.0.0; it does not grant commercial use outside those terms.

## First deployment

```bash
mkdir -p /opt/stacks/roadforge
git clone <repo-url> /opt/stacks/roadforge/src
cd /opt/stacks/roadforge/src

cp deploy/self-hosted/.env.example /opt/stacks/roadforge/.env
chmod 600 /opt/stacks/roadforge/.env
```

Edit `/opt/stacks/roadforge/.env`:

- generate a long random `POSTGRES_PASSWORD`;
- keep `NEXT_PUBLIC_API_URL`, `ROADFORGE_WEB_BASE_URL`, and
  `ROADFORGE_CORS_ORIGINS` aligned with the real public deployment;
- `ROADFORGE_CORS_ORIGINS` is also the exact allow-list for browser
  cookie-authenticated unsafe-request Origin checks;
- set `ROADFORGE_TRUSTED_PROXY_IPS` to the central nginx container IP or the narrowest
  Docker `edge` network CIDR that can supply forwarded client IP headers;
- never trust `0.0.0.0/0` or `::/0`.

Install the maintained nginx vhost and add the supplied Cloudflare ingress rule before the
final catch-all rule:

```bash
cp deploy/self-hosted/nginx/roadforge.conf \
  /opt/data/proxy/nginx/conf.d/roadforge.conf
```

Validate the proxy configuration, then deploy:

```bash
make deploy
```

## Runtime confinement

The maintained production images already run as non-root users. Compose adds compatible
runtime confinement:

- read-only root filesystems for web/API;
- all Linux capabilities dropped for web/API;
- `no-new-privileges` for every maintained service;
- PID ceilings;
- narrowly scoped tmpfs write areas for `/tmp` and the Next.js image cache.

PostgreSQL keeps its persistent writable data mount and Redis keeps its required runtime
filesystem behavior. Do not disable these controls merely to work around an unexplained
application error; diagnose the exact writable path/capability requirement first.

## Updates and the security migration

Use the supported update path:

```bash
cd /opt/stacks/roadforge/src
make update
```

`make update` performs a fast-forward-only pull, rebuilds/recreates containers, applies
`alembic upgrade head`, and prints status/log commands. Do not interrupt it between container
startup and migration completion.

For the internet-hardening release, migration `0011_remove_public_viewer_tokens.py`:

1. deactivates legacy viewer share links whose raw token had been persisted;
2. clears that raw viewer material from the live table;
3. drops the old `public_token` column.

After upgrading:

- rotate the viewer share link once when a new copyable viewer invite is needed;
- rotate pre-hardening owner/editor links that may have been distributed in `?token=` form;
- existing browser participant sessions migrate automatically from legacy localStorage
  Bearers to path-scoped HttpOnly cookies after their next successful hydration;
- refresh/reopen old tabs after the deployment when validating migration behavior.

Application rollback does **not** reverse database migrations. Create and verify a PostgreSQL
backup before schema-sensitive updates.

## Realtime and multi-worker mode

The safe default is one API worker with memory-backed realtime:

```env
ROADFORGE_REALTIME_BACKEND=memory
ROADFORGE_API_WORKERS=1
```

Multiple API workers require Redis:

```env
REDIS_URL=redis://roadforge-redis:6379/0
ROADFORGE_REALTIME_BACKEND=redis
ROADFORGE_API_WORKERS=2
```

Startup rejects multi-worker memory mode. Redis-backed realtime must connect successfully
and does not silently fall back to memory. Public Redis-backed rate limiting also fails
closed with `503` when Redis is unavailable rather than permitting unlimited requests.

Multiple workers are a topology feature, not a large-team capacity guarantee. Before
increasing worker count for a bigger team, measure API/DB/Redis/proxy/SSE behavior under
representative load and monitor those limits in production.

## Proxy and credential logging

The maintained nginx format logs `$uri`, not `$request_uri`, and omits Referer. The API
access logger records method/path/status/duration/client IP without headers, bodies, query
strings, or cookies.

New generated invite credentials are URL fragments and therefore are not sent in HTTP
request targets. SSE tickets are HttpOnly cookies and never appear in EventSource URLs.
Legacy query-token invites remain sensitive during migration, which is why query strings
must stay out of application/proxy logs.

Cloudflare, host-level proxies, observability systems, and backup tooling are outside this
repository and must be reviewed separately.

To count credential-shaped values in app-container logs without printing them:

```bash
docker compose \
  --env-file /opt/stacks/roadforge/.env \
  -f deploy/self-hosted/compose.yaml \
  --project-name roadforge \
  logs --since 168h roadforge-api roadforge-web 2>&1 \
  | grep -Eoc '(token=|ticket=|Bearer[[:space:]%]+|(sess_|ow_|ed_|vi_)[A-Za-z0-9_-]{8,})' \
  || true
```

Investigate any non-zero result and rotate/revoke affected credentials.

## Validation

Repository-level validation includes Compose parsing and production browser/CSP tests, but
operators must still validate the actual deployed edge and runtime.

```bash
make ps
make doctor
curl -fsSI https://roadforge.anvilary.tools
curl -fsS https://roadforge.anvilary.tools/api/health
```

Replace the reference hostname above with your own hostname when validating a fork/self-hosted
instance.

`/api/health` proves configured API readiness, not the complete browser collaboration path.
After every deployment:

1. Open the public RoadForge URL and verify enforced CSP/no duplicate edge CSP.
2. Create and save a small roadmap.
3. Generate an editor invite and confirm it uses `#token=`.
4. Join from a private browser window.
5. Confirm the browser stores only the non-secret auth marker; raw participant credentials
   must not remain in localStorage after successful bootstrap/migration.
6. Edit one task in each window and confirm realtime/conflict handling.
7. Rotate/revoke an invite and verify old future joins fail.
8. Revoke a participant and verify subsequent protected requests fail immediately.
9. Export JSON and re-import it as a separate local roadmap.
10. Review central nginx/Cloudflare logs for credential leakage using sanitized evidence.

For sustained/larger-team use, also run representative concurrency/load tests before
operational reliance and establish alerts for resource saturation, database/Redis health,
realtime connection failures, backup failures, and error-rate changes.

## Operations

```bash
make ps
make logs
make migrate
make restart
make doctor
```

Use `make update` for releases. `make restart` does not pull code, rebuild images, or run
migrations.

First failure checks:

```bash
cd /opt/stacks/roadforge/src
make ps
curl -fsS https://roadforge.anvilary.tools/api/health

docker compose \
  --env-file /opt/stacks/roadforge/.env \
  -f deploy/self-hosted/compose.yaml \
  --project-name roadforge \
  logs --since 30m --tail=200 roadforge-web roadforge-api roadforge-postgres roadforge-redis
```

Use your own hostname for a non-Anvilary deployment. If cookie-authenticated writes return
`403`, confirm the real browser Origin exactly matches an entry in `ROADFORGE_CORS_ORIGINS`
before changing any security policy.

## Rollback

To run a known-good application revision:

```bash
git log --oneline -10
git checkout <known-good-sha>
make deploy
```

Application rollback does not reverse Alembic migrations. Restore the database only through
a tested backup procedure.

## Persistent data

PostgreSQL data is stored under:

```text
/opt/data/apps/roadforge/postgres
```

RoadForge stores no user-uploaded filesystem assets. Redis contains transient realtime,
lock, ticket, revocation, and rate-limit coordination state when enabled.

## Do not commit

- `/opt/stacks/roadforge/.env`
- database passwords
- Cloudflare Tunnel credentials
- generated backups
- files under `/opt/data/apps/roadforge`
