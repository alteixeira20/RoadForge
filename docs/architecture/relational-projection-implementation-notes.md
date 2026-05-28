# Relational Projection Implementation Notes

## Implemented

- Added additive projection tables for phases, tasks, dependencies, and task assignees.
- Added a snapshot-to-projection mapper that rebuilds derivative rows from `roadmaps.snapshot_json`.
- Added a service-level backfill helper for active, non-deleted roadmaps.
- Wired projection rebuilds after canonical snapshot writes on create, full update/import-style save, and version restore.
- Added projection serialization and parity validation helpers.
- Added `ROADFORGE_ROADMAP_PROJECTION_READ_ENABLED`, disabled by default, to allow GET roadmap reads from projection only when parity passes.
- Documented the future partial write endpoint contract.

## Remaining

- Operator CLI or admin-only job wiring for backfill.
- Automated tests for mapper parity and sync once test execution is allowed.
- Migration application and rollback validation against a local database copy.
- Partial relational write endpoints. RF-877 is deferred because it requires new API schemas, router authorization wiring, conflict behavior, activity-log details, and manual QA beyond this projection pass.

## Validation Commands

Migration validation:

```bash
alembic upgrade head
alembic downgrade 0006
alembic upgrade head
```

Backend syntax/tests:

```bash
pytest apps/api
```

Projection/manual QA:

```bash
# Create or save a roadmap through the existing API, then inspect relational counts.
# Enable ROADFORGE_ROADMAP_PROJECTION_READ_ENABLED=true only after projection parity is confirmed.
```

## Manual QA Expectations

- Existing create, save, import-style save, version checkpoint, and version restore flows behave the same.
- `roadmaps.snapshot_json` remains canonical.
- Version restore copies `roadmap_versions.snapshot_json` back to `roadmaps.snapshot_json` before rebuilding projection.
- The read-path flag is off by default and falls back to snapshots if projection parity fails.
- No frontend behavior changes are expected.
