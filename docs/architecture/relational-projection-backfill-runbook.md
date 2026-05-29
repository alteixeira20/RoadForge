# Projection Backfill Runbook

## Purpose

The relational projection tables (`roadmap_phases`, `roadmap_tasks`,
`roadmap_task_dependencies`, `roadmap_task_assignees`) are derived from
`roadmaps.snapshot_json`, which remains the canonical source of truth.

Backfill is needed when:
- Projection tables are out of sync with `snapshot_json` (e.g., after a schema migration
  that added new projection columns, or after a manual data fix to `snapshot_json`).
- A new deployment introduces projection tables for the first time.
- An operator wants to verify projection health before enabling projection reads.

Backfill is **idempotent**: running it multiple times produces the same result.

## When to run

- After applying a migration that changes projection table structure.
- Whenever `validate_projection_parity` reports failures for a meaningful fraction of roadmaps.
- Before enabling `ROADFORGE_ROADMAP_PROJECTION_READ_ENABLED=true` in production.

**Do not enable the projection-read flag until parity is verified across all active roadmaps.**

## Running backfill locally

Requires the Postgres container to be running.

```bash
# All active roadmaps
make api-backfill-projection

# Cap at N roadmaps (useful for staged rollouts or testing)
LIMIT=50 make api-backfill-projection

# Backfill, then verify parity for processed active roadmaps
VERIFY=1 make api-backfill-projection

# Verify current projection rows without rebuilding
VERIFY_ONLY=1 make api-backfill-projection

# Direct invocation (if running outside of the Makefile)
cd apps/api
DATABASE_URL=postgresql+asyncpg://roadforge:roadforge_dev@localhost:5433/roadforge \
  python -m api.scripts.backfill_projection

# With a limit
python -m api.scripts.backfill_projection --limit 100

# Backfill with verification
python -m api.scripts.backfill_projection --verify

# Verification only
python -m api.scripts.backfill_projection --verify-only
```

## Running inside the deployed API container

```bash
# SSH into the host or exec into the running container
docker compose exec roadforge-api \
  python -m api.scripts.backfill_projection

# With a limit
docker compose exec roadforge-api \
  python -m api.scripts.backfill_projection --limit 100

# Backfill with verification
docker compose exec roadforge-api \
  python -m api.scripts.backfill_projection --verify

# Verification only
docker compose exec roadforge-api \
  python -m api.scripts.backfill_projection --verify-only
```

## Validating after backfill

Use the operator verification mode after any backfill:

```bash
python -m api.scripts.backfill_projection --verify
```

The command reports:

- checked roadmaps;
- successful parity count;
- drift/error count;
- whether projection reads can be considered safe to enable.

It exits non-zero when drift/errors are found. To inspect a single roadmap from
a Python shell inside the container:

```python
import asyncio
from api.database import async_session_factory
from api.models.roadmap import Roadmap
from api.services.roadmap_projection_service import validate_projection_parity
from sqlalchemy import select

async def check(roadmap_id: str):
    async with async_session_factory() as db:
        result = await db.execute(select(Roadmap).where(Roadmap.id == roadmap_id))
        roadmap = result.scalar_one()
        parity = await validate_projection_parity(db, roadmap)
        print(parity)

asyncio.run(check("rm_your_roadmap_id"))
```

## Safety notes

- `snapshot_json` is never modified by backfill — it is read-only input.
- Each roadmap is committed individually; a mid-run failure leaves previously
  processed roadmaps in a valid state.
- **Partial failure**: if a roadmap's snapshot is malformed and triggers an
  exception, that roadmap's projection rows will be empty (cleared but not
  rebuilt) and the run exits non-zero.  This is safe while
  `ROADFORGE_ROADMAP_PROJECTION_READ_ENABLED=false` or while the parity
  fallback is active.  Fix the offending snapshot, then rerun backfill for
  that roadmap.  Run parity validation after any backfill to confirm all
  roadmaps passed before enabling the read flag.
- `--verify-only` does not write projection tables. It checks current projection
  parity and reports whether the read flag is safe to enable.
- Projection tables are additive. Backfill only writes to projection tables and does
  not touch any other roadmap data.
- The backfill script exits non-zero naturally on unhandled failure.
- Deleted roadmaps (`deleted_at IS NOT NULL`) are skipped.

## Enabling projection reads after backfill

Once `--verify` or `--verify-only` reports zero drift/errors, set the flag in
the deployment environment:

```env
ROADFORGE_ROADMAP_PROJECTION_READ_ENABLED=true
```

If parity validation fails for any roadmap after the flag is enabled, the read
path falls back to `snapshot_json` automatically and logs a warning.
The flag can be toggled off at any time without data loss.
