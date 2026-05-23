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

Edit `/opt/stacks/roadforge/.env` and replace `POSTGRES_PASSWORD` with a long
random value. Do not commit this file.

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

**Single-worker API:** The RoadForge API must run exactly one Uvicorn worker.
The in-memory lock service, SSE event bus, and realtime ticket service are
process-local singletons — multiple workers would give each request its own
isolated copy, breaking collaboration. The `--workers 1` flag is set in the
Dockerfile CMD and must not be overridden in compose overrides or orchestration
configs.

## Validation

```bash
docker compose --env-file /opt/stacks/roadforge/.env -f deploy/hosting-bay/compose.yaml --project-name roadforge ps
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

## Public API Docs

FastAPI docs are public at `/api/docs`, `/api/redoc`, and `/api/openapi.json` by
default. The nginx config contains commented blocks to return 404 for those
paths if you decide to hide them.

## Do Not Commit

- `/opt/stacks/roadforge/.env`
- real database passwords
- Cloudflare Tunnel credentials
- generated backups
- files under `/opt/data/apps/roadforge`
