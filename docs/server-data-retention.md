# Server data retention and purge

RoadForge `0.1.0` distinguishes browser deletion, server soft deletion, and final server
purge. This document is the operator contract for final cleanup of server-side data.

The Anvilary-hosted instance is a demo/convenience deployment. Users should keep JSON
exports of important roadmaps they control; server history is not a substitute for a
portable backup.

## What deletion means

### Browser-local roadmap

Removing a browser-local roadmap removes that browser's RoadForge storage entry. Browser
site-data controls can also remove local roadmaps outside RoadForge. There is no server
copy unless the roadmap was explicitly synced.

### Synced roadmap delete

The normal owner delete action is a **soft delete**. `roadmaps.deleted_at` is set so the
roadmap stops participating in normal application reads while the operator retains a
recovery/incident window.

### Final server purge

Only the operator retention command hard-deletes a soft-deleted roadmap and its dependent
server records after the configured age threshold.

Do not promise that the owner delete button immediately removes every database row or
backup copy.

## Default retention policy

The operator command defaults to:

| Category | Default | Safety behavior |
| --- | ---: | --- |
| expired/revoked participant sessions | 7-day cleanup grace | active/non-expired sessions are never selected |
| activity on active roadmaps | 180 days | current roadmap data is untouched |
| restore points on active roadmaps | 90 days | at least the newest 3 versions per roadmap are always retained |
| soft-deleted roadmaps | 30 days | only `deleted_at` older than the cutoff can be hard-deleted |
| batch size | 100 per category | each run is intentionally bounded |

The service refuses thresholds below conservative minimums:

- session grace: 1 day;
- activity: 30 days;
- restore points: 30 days;
- soft-deleted roadmaps: 7 days;
- at least one restore point must always be preserved for an active roadmap;
- maximum batch size is 1,000 per category.

These minimums are code-enforced, not only CLI advice.

## Volatile realtime data

SSE tickets, edit locks, and rate-limit buckets are volatile coordination state in memory
or Redis and already have TTL/expiry behavior. They are not PostgreSQL retention rows and
are not handled by the purge command.

Redis should be operated with its own persistence/backup policy appropriate to its role as
coordination state rather than roadmap source of truth.

## Dry run

Always inspect a dry run first:

```bash
cd /opt/stacks/roadforge/src

docker compose \
  --env-file /opt/stacks/roadforge/.env \
  -f deploy/self-hosted/compose.yaml \
  --project-name roadforge \
  run --rm --no-deps roadforge-api \
  python -m api.scripts.purge_retention
```

The output is one-line JSON containing policy values and **counts only**. It does not print
roadmap names/content, participant names, tokens, activity payloads, or credentials.

Example shape:

```json
{
  "mode": "dry-run",
  "counts": {
    "expired_or_revoked_sessions": 4,
    "old_activity_rows": 100,
    "old_restore_points": 12,
    "soft_deleted_roadmaps": 2,
    "total_rows": 118
  }
}
```

The command's default mode never deletes data.

## Destructive execution

Before final purge:

1. confirm you are targeting the intended deployment/database;
2. create and verify a PostgreSQL backup according to `docs/self-hosting.md`;
3. run the dry-run command and review the counts;
4. only then execute the same policy with explicit confirmation.

```bash
cd /opt/stacks/roadforge/src

docker compose \
  --env-file /opt/stacks/roadforge/.env \
  -f deploy/self-hosted/compose.yaml \
  --project-name roadforge \
  run --rm --no-deps roadforge-api \
  python -m api.scripts.purge_retention \
  --execute --confirm PURGE
```

Both `--execute` and the literal `--confirm PURGE` are required. Supplying confirmation
without execute is rejected as a configuration mistake.

## Custom retention

Longer retention can be selected explicitly:

```bash
python -m api.scripts.purge_retention \
  --session-grace-days 14 \
  --activity-days 365 \
  --version-days 180 \
  --deleted-roadmap-days 60 \
  --preserve-versions 5 \
  --batch-limit 100
```

Use the same arguments for dry-run and execute. Never shorten retention merely to make a
large backlog disappear quickly; use repeated bounded batches instead.

## Restart safety

Each execution builds one bounded plan and deletes that exact set in one database
transaction. A successful batch can be run again safely: already deleted primary keys
produce zero additional deletions. An interrupted transaction rolls back rather than
leaving a half-committed plan.

Roadmap hard deletion relies on database foreign-key cascade rules. Participant deletion
uses the existing `SET NULL` relationships so retained activity/version rows do not depend
on an expired participant record.

## Scheduling

For a small public/demo deployment, run dry-run daily or weekly and execute final purge on
a documented maintenance schedule, for example weekly after a successful backup.

Do **not** schedule an unconditional destructive command without first monitoring dry-run
counts. A safer automation pattern is:

1. scheduled dry-run -> retained operator log/metric;
2. alert on unexpectedly large counts or command failure;
3. separate bounded execute job after backup verification.

If fully automated execute is later adopted, the deployment owner should define an
explicit maximum expected deletion count and alert on anomalies before increasing batch
limits.

## Monitoring

Record only:

- execution timestamp;
- deployed RoadForge revision;
- policy thresholds;
- dry-run/executed counts;
- success/failure status;
- backup identifier/checksum reference where appropriate.

Do not record deleted roadmap IDs, names, participant names, tokens, snapshots, activity
payloads, or database connection strings in routine retention logs.

A repeated full `batch_limit` result means backlog remains; run another dry-run/batch rather
than bypassing bounds.

## Recovery

A hard purge is intentionally irreversible inside the live RoadForge database. Recovery
requires a pre-purge PostgreSQL backup or another operator-controlled backup copy.

Restore into a disposable database first and inspect the affected data before replacing or
repairing production state. Follow the restore procedure in `docs/self-hosting.md`.

Backups have their **own** retention lifecycle. Hard-purging the live database does not
magically remove historical backup copies, so public privacy/deletion wording must describe
backup retention accurately.

## Product wording

Public/help/privacy copy should say, in substance:

- local roadmaps live in browser storage and users should keep JSON exports;
- deleting a synced roadmap removes it from normal RoadForge use immediately through soft
  deletion;
- final server records are purged according to the operator retention schedule;
- independent database/backups may remain until their documented backup-retention expiry.

Do not claim immediate cryptographic erasure or guaranteed hosted recovery.

## Verification

The API test suite covers:

- minimum threshold validation;
- protection of active roadmaps;
- protection of recently deleted roadmaps;
- activity/version retention on active roadmaps;
- preservation of newest restore points;
- expired/revoked session grace;
- database cascade behavior for an eligible deleted roadmap;
- idempotent reruns;
- bounded batch selection.

Run before deploying a retention change:

```bash
make api-lint
make api-test
make api-check
```
