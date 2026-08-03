# Self-hosting RoadForge

This deployment targets `roadforge.anvilary.tools` with Docker Compose,
PostgreSQL, optional Redis-backed realtime, a central nginx proxy, and a
Cloudflare Tunnel.

Expected paths:

- repository: `/opt/stacks/roadforge/src`
- private environment file: `/opt/stacks/roadforge/.env`
- persistent PostgreSQL data: `/opt/data/apps/roadforge/postgres`
- central nginx configuration: `/opt/data/proxy/nginx/conf.d`

RoadForge is public by default. Invite links provide access; Cloudflare Access is
not part of the standard product flow.

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
- set the public web/API origins;
- set `ROADFORGE_TRUSTED_PROXY_IPS` to the central nginx container IP or the
  narrowest Docker `edge` network CIDR that can reach the API;
- never trust `0.0.0.0/0` or `::/0`.

Install the nginx vhost and add the supplied Cloudflare ingress rule before the
final catch-all rule:

```bash
cp deploy/self-hosted/nginx/roadforge.conf \
  /opt/data/proxy/nginx/conf.d/roadforge.conf
```

Validate the proxy configuration, then deploy:

```bash
make deploy
```

The API container runs as a non-root user. The nginx template accepts roadmap
payloads up to 5 MiB, matches the browser/API limit, and omits query strings and
`Referer` from RoadForge access logs because join tokens and SSE tickets can
appear in URLs.

## Updates

Use the supported update path from the repository root:

```bash
cd /opt/stacks/roadforge/src
make update
```

`make update` performs a fast-forward-only pull, rebuilds and recreates the
containers, applies `alembic upgrade head`, and prints status and log commands.
Do not interrupt it between container startup and migration completion.

Never maintain a release-specific migration instruction in this guide. Every
update must migrate to the current Alembic head.

## Realtime mode

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

Application and container startup reject multiple workers with the memory
backend. Redis mode must connect successfully and does not silently fall back to
memory.

## Validation

```bash
make ps
make doctor
curl -fsSI https://roadforge.anvilary.tools
curl -fsS https://roadforge.anvilary.tools/api/health
```

`/api/health` proves only API liveness. It does not prove PostgreSQL, Redis,
migrations, realtime propagation, or the frontend are healthy.

Complete this browser check after every deployment:

1. Open the public RoadForge URL.
2. Create a small roadmap and save it.
3. Generate an editor invite.
4. Join from a private browser window.
5. Edit one task in each window and confirm sync and conflict handling.
6. Export JSON and re-import it as a separate local roadmap.

## Operations

```bash
make ps
make logs
make migrate
make restart
make doctor
```

Use `make update` for releases. `make restart` only restarts existing containers;
it does not pull code, rebuild images, or run migrations.

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

Interpretation:

- public request fails but containers are healthy: inspect DNS, Cloudflare
  Tunnel, TLS, central nginx, and Docker network routing;
- API health fails: inspect API startup, environment validation, migrations, and
  PostgreSQL;
- Redis mode fails: inspect Redis connectivity before testing collaboration;
- memory mode behaves inconsistently: confirm exactly one worker and one API
  container exist.

## Credential-safe log review

The application does not intentionally log request headers, bodies, query
strings, or complete request URLs. To count credential-shaped values without
printing them:

```bash
docker compose \
  --env-file /opt/stacks/roadforge/.env \
  -f deploy/self-hosted/compose.yaml \
  --project-name roadforge \
  logs --since 168h roadforge-api roadforge-web 2>&1 \
  | grep -Eoc '(token=|ticket=|Bearer[[:space:]%]+|(sess_|ow_|ed_|vi_)[A-Za-z0-9_-]{8,})' \
  || true
```

Investigate any non-zero result. Restrict log access and rotate or revoke affected
credentials. Review central nginx, Cloudflare, and other upstream logs
separately; those systems are outside this repository.

## Rollback

Before a schema-sensitive update, create and verify a PostgreSQL backup. To run a
known-good application revision:

```bash
git log --oneline -10
git checkout <known-good-sha>
make deploy
```

Application rollback does not reverse database migrations. Restore the database
only through a tested backup procedure.

## Persistent data

PostgreSQL data is stored under:

```text
/opt/data/apps/roadforge/postgres
```

RoadForge stores no user-uploaded filesystem assets. Redis contains transient
realtime coordination state when enabled.

## Do not commit

- `/opt/stacks/roadforge/.env`
- database passwords
- Cloudflare Tunnel credentials
- generated backups
- files under `/opt/data/apps/roadforge`
