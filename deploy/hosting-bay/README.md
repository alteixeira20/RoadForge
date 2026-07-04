# RoadForge on hosting-bay

Deployment target:

- Public domain: `roadforge.alexandreteixeira.dev`
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
cp deploy/hosting-bay/.env.example /opt/stacks/roadforge/.env
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
cp deploy/hosting-bay/nginx/roadforge.conf /opt/data/proxy/nginx/conf.d/roadforge.conf
```

Add `deploy/hosting-bay/cloudflared-ingress-snippet.yml` to the Cloudflare
Tunnel ingress config before the final `http_status:404` rule.

Deploy:

```bash
make deploy
```

## Updates

From the repo root on hosting-bay:

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
docker compose --env-file /opt/stacks/roadforge/.env -f deploy/hosting-bay/compose.yaml --project-name roadforge ps
docker compose --env-file /opt/stacks/roadforge/.env -f deploy/hosting-bay/compose.yaml --project-name roadforge exec roadforge-redis redis-cli ping
curl -I https://roadforge.alexandreteixeira.dev
curl -s https://roadforge.alexandreteixeira.dev/api/health
```

Browser checks:

1. Open `https://roadforge.alexandreteixeira.dev`.
2. Create a roadmap and save it.
3. Generate an editor invite link.
4. Confirm the link starts with `https://roadforge.alexandreteixeira.dev/join?token=`.
5. Join from a private window and confirm realtime sync works.

## Logs And Operations

```bash
make ps
make logs
make migrate
make restart
make doctor
```

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
