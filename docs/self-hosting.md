# Self-Hosting RoadForge

RoadForge is a Public Alpha product from Anvilary. Its repository and codebase
remain private during alpha. A public source release is planned when RoadForge is
beta-ready under non-commercial source-available terms, not a permissive
open-source license. Commercial hosting and monetized use will not be permitted
under the intended license.

## Topology

The supported alpha topology is:

- Next.js web app;
- FastAPI API;
- PostgreSQL 16;
- optional Redis for shared realtime, locks, tickets, and rate limits;
- HTTPS reverse proxy.

Use `deploy/hosting-bay/` as the production-oriented Compose example. It requires
explicit secrets, origins, database credentials, web URL, and trusted proxy ranges.

## Deployment sequence

1. Back up PostgreSQL.
2. Build the release images.
3. Start PostgreSQL and Redis.
4. Run `alembic upgrade head`.
5. Run projection backfill with parity verification.
6. Start one API worker for memory mode, or enable Redis before multiple workers.
7. Start the web app and reverse proxy.
8. Verify health, create/join/share, realtime, import/export, and backup restore.

Exact commands and environment variables are documented in
`deploy/hosting-bay/README.md` and `docs/public-deployment-security.md`.

## Authentication modes

The alpha has no accounts or OAuth. Access uses role-scoped invite links, optional
roadmap passwords, and participant session tokens.

- Owner and editor join URLs are credentials that grant their named role. Do not
  expose them in logs, screenshots, analytics, issue reports, or support messages.
- The viewer URL is intentionally public-capable but still grants access to the
  roadmap. Treat it as a read-only credential and rotate or disable it when the
  audience should change.
- Invite links do not expire on a timer. They remain valid until the owner rotates
  or revokes that role's link. Rotation/revocation blocks future joins but does not
  revoke sessions that already joined through the old link.
- Participant sessions use a 30-day sliding expiry. An authenticated request renews
  an active session when its presence timestamp is stale. Owners revoke an existing
  participant separately from rotating or revoking an invite.
- Session tokens are Bearer credentials stored in browser `localStorage`. Never put
  them in URLs or operator commands that may be retained in shell history.

The FastAPI application does not log headers, bodies, query strings, or full request
URLs. Its access log contains only method, path, and status. The hosting-bay nginx
template also omits query strings and `Referer` from its access log. Proxy error
logs and infrastructure outside this repository can still contain full request
targets; operators must review and restrict those logs.

## Backups and updates

Back up PostgreSQL before every migration. On hosting-bay, run:

```bash
cd /opt/stacks/roadforge/src
umask 077
mkdir -p /opt/data/apps/roadforge/backups
BACKUP="/opt/data/apps/roadforge/backups/roadforge-$(date -u +%Y%m%dT%H%M%SZ).dump"

docker compose \
  --env-file /opt/stacks/roadforge/.env \
  -f deploy/hosting-bay/compose.yaml \
  --project-name roadforge \
  exec -T roadforge-postgres \
  pg_dump -U roadforge -d roadforge --format=custom --no-owner --no-acl \
  > "$BACKUP"

test -s "$BACKUP"
docker compose \
  --env-file /opt/stacks/roadforge/.env \
  -f deploy/hosting-bay/compose.yaml \
  --project-name roadforge \
  exec -T roadforge-postgres pg_restore --list < "$BACKUP" > /dev/null
sha256sum "$BACKUP" > "$BACKUP.sha256"
echo "Backup written to $BACKUP"
```

Keep the dump and checksum outside the repository and PostgreSQL data directory.
Copy them to storage with an independent retention policy.

### Disposable restore drill

Restore only into a uniquely named disposable database. Never use `roadforge` as
`DRILL_DB`.

```bash
cd /opt/stacks/roadforge/src
BACKUP=/opt/data/apps/roadforge/backups/roadforge-YYYYmmddTHHMMSSZ.dump
DRILL_DB="roadforge_restore_$(date -u +%Y%m%dT%H%M%SZ)"
test "$DRILL_DB" != roadforge
test -s "$BACKUP"
sha256sum -c "$BACKUP.sha256"

docker compose \
  --env-file /opt/stacks/roadforge/.env \
  -f deploy/hosting-bay/compose.yaml \
  --project-name roadforge \
  exec -T roadforge-postgres createdb -U roadforge "$DRILL_DB"

docker compose \
  --env-file /opt/stacks/roadforge/.env \
  -f deploy/hosting-bay/compose.yaml \
  --project-name roadforge \
  exec -T roadforge-postgres \
  pg_restore -U roadforge -d "$DRILL_DB" --no-owner --no-acl --exit-on-error \
  < "$BACKUP"
```

Verify the required domain data and projection relationships:

```bash
docker compose \
  --env-file /opt/stacks/roadforge/.env \
  -f deploy/hosting-bay/compose.yaml \
  --project-name roadforge \
  exec -T roadforge-postgres \
  psql -U roadforge -d "$DRILL_DB" -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'roadmaps' AS item, count(*) AS rows FROM roadmaps
UNION ALL SELECT 'participants', count(*) FROM participants
UNION ALL SELECT 'versions', count(*) FROM roadmap_versions
UNION ALL SELECT 'activity', count(*) FROM activity_logs
UNION ALL SELECT 'projection_phases', count(*) FROM roadmap_phases
UNION ALL SELECT 'projection_tasks', count(*) FROM roadmap_tasks;

SELECT id, name, created_at, updated_at
FROM roadmaps
ORDER BY updated_at DESC
LIMIT 10;

SELECT count(*) AS orphan_projection_phases
FROM roadmap_phases p
LEFT JOIN roadmaps r ON r.id = p.roadmap_id
WHERE r.id IS NULL;

SELECT count(*) AS orphan_projection_tasks
FROM roadmap_tasks t
LEFT JOIN roadmaps r ON r.id = t.roadmap_id
LEFT JOIN roadmap_phases p ON p.id = t.phase_id
WHERE r.id IS NULL OR p.id IS NULL;
SQL

docker compose \
  --env-file /opt/stacks/roadforge/.env \
  -f deploy/hosting-bay/compose.yaml \
  --project-name roadforge \
  run --rm --no-deps -T \
  -e RESTORE_DB="$DRILL_DB" \
  roadforge-api sh -lc \
  'export DATABASE_URL="${DATABASE_URL%/*}/${RESTORE_DB}"; python -m api.scripts.backfill_projection --verify-only'
```

Check that representative roadmap names and expected counts match the
source environment, both orphan counts are zero, and projection parity reports no
drift. If `--verify-only` reports drift, record the restore as preserving source
data but not yet passing projection verification. Do not repair the live database
as part of the restore drill. Because `snapshot_json` is canonical, you may prove
projection recovery only in the disposable database:

```bash
docker compose \
  --env-file /opt/stacks/roadforge/.env \
  -f deploy/hosting-bay/compose.yaml \
  --project-name roadforge \
  run --rm --no-deps -T \
  -e RESTORE_DB="$DRILL_DB" \
  roadforge-api sh -lc \
  'export DATABASE_URL="${DATABASE_URL%/*}/${RESTORE_DB}"; python -m api.scripts.backfill_projection --verify'
```

Investigate source-environment drift through the normal projection backfill
runbook before release. Then remove only the disposable database:

```bash
test "$DRILL_DB" != roadforge
docker compose \
  --env-file /opt/stacks/roadforge/.env \
  -f deploy/hosting-bay/compose.yaml \
  --project-name roadforge \
  exec -T roadforge-postgres dropdb -U roadforge --if-exists --force "$DRILL_DB"
unset DRILL_DB BACKUP
```

- Export important roadmaps from the browser as an additional portable copy.
- Treat Alembic downgrades as unsupported unless a migration explicitly documents one.
- Review `CHANGELOG.md`, environment changes, and the release checklist before update.
- Test restore procedures; an untested backup is not a recovery plan.

## Down-scenario runbook

Work through these checks in order when RoadForge is unreachable or misbehaving.
Each step names what to inspect and the command to inspect it with.

1. **Health endpoint.** `curl -fsS https://<host>/api/health` (or
   `http://localhost:7878/api/health` on the API host directly, bypassing the
   proxy). A non-200 response or connection failure means the API process
   itself is down or unreachable; a 200 here but failures from the public host
   point at the reverse proxy or TLS instead. `/api/health` is liveness only —
   it does not check PostgreSQL or Redis.
2. **Container status.** `docker compose --env-file /opt/stacks/roadforge/.env
   -f deploy/hosting-bay/compose.yaml --project-name roadforge ps`. Confirm
   `roadforge-web`, `roadforge-api`, `roadforge-postgres`, and (if enabled)
   `roadforge-redis` are all `running`/`healthy`. A restarting or exited
   container is the fastest signal of which layer failed.
3. **Reverse proxy / tunnel / TLS.** Check the proxy's own health (nginx
   `systemctl status`, container status, or tunnel process) and certificate
   validity (`openssl s_client -connect <host>:443 -servername <host> </dev/null
   2>&1 | openssl x509 -noout -dates`). A proxy that is up but returning
   502/504 usually means it cannot reach `roadforge-web` or `roadforge-api` on
   the internal network.
4. **Redis mode.** If `ROADFORGE_REALTIME_BACKEND=redis`, confirm
   `roadforge-redis` is healthy and reachable from the API container
   (`docker compose ... exec roadforge-api redis-cli -h roadforge-redis ping`).
   Redis backs shared realtime, locks, tickets, and rate limits across workers;
   if it is down, restart it before assuming an application bug. Memory-mode
   deployments (no `ROADFORGE_REALTIME_BACKEND=redis`) do not depend on Redis
   and can skip this step.
5. **Database connectivity.** `docker compose ... exec roadforge-postgres
   pg_isready -U roadforge` and, if that passes but requests still fail,
   `docker compose ... exec roadforge-api python -m api.scripts.backfill_projection
   --verify-only` to check for projection drift. See
   [Database migrations and deployment ordering](public-deployment-security.md#database-migrations-and-deployment-ordering)
   if the API was recently redeployed — an API container running ahead of
   pending migrations returns 500s on any route touching a new/changed table.
6. **Logs.** `docker compose ... logs --tail=100 roadforge-api` and
   `... logs --tail=100 roadforge-web` first; add `roadforge-postgres` or
   `roadforge-redis` if those layers are implicated. FastAPI access logs
   contain only method, path, and status — no bodies, headers, or query
   strings — so application logs will not leak share-link tokens or session
   tokens. Proxy logs and upstream providers are outside this repository and
   need separate review; see
   [credential-safe log commands](../deploy/hosting-bay/README.md#credential-safe-log-review).
7. **Restart / update path.** For a stuck container, restart just that
   service: `docker compose ... restart roadforge-api`. For a full update,
   follow the [Deployment sequence](#deployment-sequence) above — back up
   first, rebuild images, then bring the stack back up in order (Postgres and
   Redis, then run pending migrations, then the API, then the web app and
   proxy).
8. **Backup/restore sanity.** Confirm the most recent backup exists and is
   non-empty: `test -s <backup>.dump && sha256sum -c <backup>.dump.sha256`.
   Do not restore into the live `roadforge` database to test this — use the
   [disposable restore drill](#disposable-restore-drill) against a scratch
   database name.
9. **Rollback.** Alembic downgrades are unsupported unless a specific
   migration documents one — do not attempt `alembic downgrade` as a recovery
   step. To roll back, redeploy the previous known-good API/web image tags
   and, if the incident followed a migration, restore PostgreSQL from the
   pre-migration backup into a fresh database rather than downgrading the
   schema in place. Treat an untested backup as no backup; validate the
   restore drill on this data before relying on it during an incident.

## Content Security Policy

The production CSP remains `Content-Security-Policy-Report-Only` for Public Alpha.
Enforcement is deferred because the repository has no CSP report collector and no
recorded production-build browser run proving that Next.js bootstrap scripts,
styled JSX/inline React styles, Markdown rendering, API requests, and SSE work
without violations. The policy deliberately avoids adding production
`script-src 'unsafe-inline'` merely to make enforcement appear ready.

Before changing the header to `Content-Security-Policy`, run a production build in
staging, exercise every route and the create/save/share/join/import/export/realtime
flows, and capture a clean browser console plus Network response headers. Any
required exception must be narrow and documented. Report-only is observability,
not blocking protection.

## Operations

Use HTTPS, narrow trusted proxy CIDRs, non-default secrets, private database/Redis
networks, log retention controls, and dependency monitoring. The alpha has no uptime,
support, or hosted-data recovery guarantee.
