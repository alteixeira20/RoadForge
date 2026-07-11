# Self-hosting RoadForge

Deployment target:

- Public domain: `roadforge.anvilary.tools`
- Repo path: `/opt/stacks/roadforge/src`
- Persistent data: `/opt/data/apps/roadforge`
- Nginx config path: `/opt/data/proxy/nginx/conf.d`
- Public ingress: Cloudflare Tunnel -> central nginx -> Docker `edge` network

RoadForge is public by default. Do not put it behind Cloudflare Access unless the
product decision changes.

## First Deploy

Clone the repo:

```bash
mkdir -p /opt/stacks/roadforge
git clone <repo-url> /opt/stacks/roadforge/src
cd /opt/stacks/roadforge/src
```

Create the deployment env file outside the repo:

```bash
cp deploy/self-hosted/.env.example /opt/stacks/roadforge/.env
chmod 600 /opt/stacks/roadforge/.env
```

Edit `/opt/stacks/roadforge/.env` and replace every placeholder. In particular:

- generate long random values for `POSTGRES_PASSWORD` and `ROADFORGE_SECRET_KEY`;
- set `ROADFORGE_TRUSTED_PROXY_IPS` to the central nginx container IP or the
  narrowest Docker `edge` network CIDR that can reach the API;
- never trust `0.0.0.0/0` or `::/0`.

The trusted-proxy value is required so rate limits use the client address
forwarded by nginx instead of grouping all visitors under the proxy address.
Do not commit the environment file.

Install nginx config:

```bash
cp deploy/self-hosted/nginx/roadforge.conf /opt/data/proxy/nginx/conf.d/roadforge.conf
```

The vhost uses a dedicated `roadforge_safe` access format. It logs method, path,
status, and user agent, but omits query strings and `Referer`; both can contain
invite or short-lived SSE credentials. The format declaration must remain in an
nginx `http` context (the normal `conf.d` include location). Validate the central
proxy before reloading it.

Add `deploy/self-hosted/cloudflared-ingress-snippet.yml` to the Cloudflare
Tunnel ingress config before the final `http_status:404` rule.

Deploy:

```bash
make deploy
```

## Updates

From the repository root on the server:

```bash
cd /opt/stacks/roadforge/src
make update
```

`make update` runs `git pull --ff-only`, rebuilds images, updates containers,
runs Alembic migrations, and prints container status plus log hints.

**Schema-sensitive releases:** If the release you are pulling includes new files
under `apps/api/alembic/versions/`, the migration step is critical. The sequence
is already enforced by `make update` (rebuild → up → migrate), but do not
interrupt it between the `up` and `migrate` steps.

Current required migration note:

- `0005_add_public_viewer_tokens.py` adds storage for active public viewer/demo
  tokens. Run `make migrate` before validating Share modal behavior, otherwise
  active viewer links may not remain copyable after reopening the modal.

**API worker mode:** The RoadForge API is single-worker by default through
`ROADFORGE_API_WORKERS=1`. Multi-worker mode is configurable only when
`ROADFORGE_REALTIME_BACKEND=redis`; the Dockerfile startup command refuses to
start with `ROADFORGE_API_WORKERS` greater than `1` unless the Redis realtime
backend is active. Application startup enforces the same combination. Keep
`memory` plus one worker and one API instance for ordinary local/deploy
maintenance.

**Redis backend status:** The compose stack provisions private Redis at
`redis://roadforge-redis:6379/0`. Set `ROADFORGE_REALTIME_BACKEND=redis` and a
worker count greater than `1` only for RF-886 staging validation or an approved
multi-worker deployment. Redis mode requires a successful startup ping and does
not fall back to memory. Do not use multiple workers or API instances with the
memory backend.

## Validation

```bash
docker compose --env-file /opt/stacks/roadforge/.env -f deploy/self-hosted/compose.yaml --project-name roadforge ps
docker compose --env-file /opt/stacks/roadforge/.env -f deploy/self-hosted/compose.yaml --project-name roadforge exec roadforge-postgres pg_isready -U roadforge -d roadforge
docker compose --env-file /opt/stacks/roadforge/.env -f deploy/self-hosted/compose.yaml --project-name roadforge exec roadforge-redis redis-cli ping
curl -fsSI https://roadforge.anvilary.tools
curl -fsS https://roadforge.anvilary.tools/api/health
```

`/api/health` is a non-sensitive API liveness check. It returns only application
status and version; it does not prove PostgreSQL, Redis, cross-worker realtime, or
the browser application is healthy. The explicit checks above and the browser
checks below remain required. In memory mode, Redis may be healthy but unused.

Browser checks:

1. Open `https://roadforge.anvilary.tools`.
2. Create a roadmap and save it.
3. Generate an editor invite link.
4. Confirm the link starts with `https://roadforge.anvilary.tools/join?token=`.
5. Join from a private window and confirm realtime sync works.

## Logs And Operations

```bash
make ps
make logs
make migrate
make restart
make doctor
```

All stack services use `restart: unless-stopped`, so Docker restarts them after a
daemon/host restart unless an operator explicitly stopped them. `make restart`
restarts PostgreSQL, API, and Web without rebuilding or migrating. `make update`
pulls, rebuilds, recreates services, applies migrations, and is the release update
path. Neither command replaces a pre-update backup and restore drill; use
[the backup procedure](../../docs/self-hosting.md#backups-and-updates).

### First failure checks

Run these in order when RoadForge is down:

```bash
cd /opt/stacks/roadforge/src
docker compose --env-file /opt/stacks/roadforge/.env -f deploy/self-hosted/compose.yaml --project-name roadforge ps
curl -fsS https://roadforge.anvilary.tools/api/health
docker compose --env-file /opt/stacks/roadforge/.env -f deploy/self-hosted/compose.yaml --project-name roadforge logs --since 30m --tail=200 roadforge-web roadforge-api
docker compose --env-file /opt/stacks/roadforge/.env -f deploy/self-hosted/compose.yaml --project-name roadforge logs --since 30m --tail=200 roadforge-postgres roadforge-redis
docker compose --env-file /opt/stacks/roadforge/.env -f deploy/self-hosted/compose.yaml --project-name roadforge exec roadforge-postgres pg_isready -U roadforge -d roadforge
docker compose --env-file /opt/stacks/roadforge/.env -f deploy/self-hosted/compose.yaml --project-name roadforge exec roadforge-redis redis-cli ping
```

- A failed public request with healthy containers points first to Cloudflare
  Tunnel, the central nginx config/network, DNS, or TLS.
- A failed API health check with a healthy Web container points first to API
  startup/configuration and PostgreSQL logs.
- In Redis realtime mode, a failed Redis ping or Redis errors in API logs make
  tickets, locks, Pub/Sub, and shared rate limits unavailable; the API does not
  fall back to memory. Complete the
  [RF-886 checks](../../docs/manual-qa.md#30b--rf-886-multi-worker-realtime-regression-checklist)
  after recovery.
- In memory mode, confirm exactly one worker and one API instance. Health alone
  cannot detect an accidentally duplicated one-worker API deployment.

### Credential-safe log review

The application emits method/path/status access records and never intentionally
logs request headers, bodies, query strings, or full request URLs. Browser error
messages do not echo invite/session values. This is a local code/config audit,
not evidence about existing production logs or upstream Cloudflare logging.

Review stack logs for credential-shaped values without printing matches:

```bash
cd /opt/stacks/roadforge/src
docker compose \
  --env-file /opt/stacks/roadforge/.env \
  -f deploy/self-hosted/compose.yaml \
  --project-name roadforge \
  logs --since 168h roadforge-api roadforge-web 2>&1 \
  | grep -Eoc '(token=|ticket=|Bearer[[:space:]%]+|(sess_|ow_|ed_|vi_)[A-Za-z0-9_-]{8,})' \
  || true
```

Expected after this release: `0`. To inspect any historical matches, redact them
before display:

```bash
docker compose \
  --env-file /opt/stacks/roadforge/.env \
  -f deploy/self-hosted/compose.yaml \
  --project-name roadforge \
  logs --since 168h roadforge-api roadforge-web 2>&1 \
  | sed -E \
    -e 's/((token|ticket)=)[^ &"]+/\1[REDACTED]/g' \
    -e 's/(Bearer[[:space:]%]+)[A-Za-z0-9._~-]+/\1[REDACTED]/g' \
    -e 's/(sess_|ow_|ed_|vi_)[A-Za-z0-9_-]+/\1[REDACTED]/g'
```

Find the central nginx container that has the installed RoadForge vhost, then
count credential-shaped values in current access and error logs:

```bash
PROXY_CONTAINER=$(
  docker ps --format '{{.Names}}' |
  while read -r container; do
    docker exec "$container" test -f /etc/nginx/conf.d/roadforge.conf 2>/dev/null &&
      { echo "$container"; break; }
  done
)
test -n "$PROXY_CONTAINER"
docker exec "$PROXY_CONTAINER" nginx -T 2>&1 \
  | grep -F 'access_log /var/log/nginx/roadforge.access.log roadforge_safe;'
docker exec "$PROXY_CONTAINER" sh -c \
  'cat /var/log/nginx/roadforge.access.log /var/log/nginx/error.log 2>/dev/null' \
  | grep -Eoc '([?&](token|ticket)=|Bearer[[:space:]%]+|(sess_|ow_|ed_|vi_)[A-Za-z0-9_-]{8,})' \
  || true
```

The count must be investigated, not assumed to be caused by current code. Nginx
error messages and retained logs from the old format may still contain full
request targets. If a real credential is found, restrict log access, rotate the
affected invite or revoke the affected participant session, and apply the normal
retention/deletion policy. Also review Cloudflare Tunnel/provider logs separately;
their configuration is outside this repository.

## Rollback Notes

If an update fails after `git pull`, inspect recent commits and redeploy a known
good revision:

```bash
git log --oneline -5
git checkout <known-good-sha>
make deploy
```

Database state is persistent under `/opt/data/apps/roadforge/postgres`.
Application rollback does not roll back database migrations. Take a Postgres
backup before risky schema changes.

## Persistent Data

Postgres data is mounted at:

```text
/opt/data/apps/roadforge/postgres
```

No user uploads or filesystem assets are stored by the app.

Redis backs realtime coordination only when `ROADFORGE_REALTIME_BACKEND=redis`.
With `ROADFORGE_REALTIME_BACKEND=memory`, runtime collaboration state remains
single-worker and process-local.

## API Docs

FastAPI docs and OpenAPI are disabled by the production application. The nginx
configuration also returns 404 for `/api/docs`, `/api/redoc`, and
`/api/openapi.json`.

## Do Not Commit

- `/opt/stacks/roadforge/.env`
- real database passwords
- Cloudflare Tunnel credentials
- generated backups
- files under `/opt/data/apps/roadforge`
