# Relational Projection Implementation Notes

## Implemented

- Added additive projection tables for phases, tasks, dependencies, and task assignees.
- Added a snapshot-to-projection mapper that rebuilds derivative rows from `roadmaps.snapshot_json`.
- Added a service-level backfill helper for active, non-deleted roadmaps.
- Wired projection rebuilds after canonical snapshot writes on create, full update/import-style save, and version restore.
- Added projection serialization, parity validation, and drift reporting helpers.
- Added `ROADFORGE_ROADMAP_PROJECTION_READ_ENABLED`, disabled by default, to allow GET roadmap reads from projection only when parity passes.
- Documented the partial write endpoint contract. Task done and claim operations use
  snapshot-first focused writes; tag registry writes remain separate from the
  phase/task projection.

## RF-821 Completion Criteria

RF-821 is complete when all of the following are true:

- The additive relational projection schema exists and its migration is applied.
- Projection rows can be rebuilt from `roadmaps.snapshot_json`.
- Parity tests cover create, full update/import-style save, and version restore.
- An operator backfill command exists.
- Drift/parity reporting exists for one or many active roadmaps.
- `ROADFORGE_ROADMAP_PROJECTION_READ_ENABLED` remains off by default.
- `roadmaps.snapshot_json` remains the canonical write source of truth.
- Projection reads fall back safely to the canonical snapshot when parity or
  serialization fails.
- Deployment/operator runbook coverage exists for backfill, verification, and
  guarded read-flag enablement.
- The RF-821 completion audit verified all of the above.

## Snapshot Canonical Policy

- `roadmaps.snapshot_json` is the write source of truth for the full roadmap.
- Projection tables are derivative, read-optimized, and rebuildable.
- Full-roadmap writes update `snapshot_json` first, then synchronize projection
  rows on a best-effort/additive basis.
- Backfill can rebuild projection rows from `snapshot_json` without changing the
  canonical snapshot.
- Projection reads are optional and guarded by
  `ROADFORGE_ROADMAP_PROJECTION_READ_ENABLED`; the flag stays disabled by
  default and should only be enabled after parity verification passes.
- Broader partial relational writes require separate endpoint-specific policy
  decisions. RF-821 does not make relational rows canonical, and RF-877 keeps
  `snapshot_json` canonical for the first task done toggle.

## Completed in RF-1906–1910 and Phase 22

- Operator backfill script: `apps/api/src/api/scripts/backfill_projection.py`.
  Makefile target: `make api-backfill-projection`.
  Runbook: `docs/architecture/relational-projection-backfill-runbook.md`.
- Operator verification modes:
  - `python -m api.scripts.backfill_projection --verify` rebuilds projection
    rows, then verifies parity for the processed active roadmaps.
  - `python -m api.scripts.backfill_projection --verify-only` verifies current
    projection rows without rebuilding.
  - The report includes checked roadmaps, successful parity count, drift/error
    count, and whether projection reads can be considered safe to enable.
- Automated projection suites and focused write tests cover:
  - `apps/api/tests/test_roadmap_projection_roundtrip.py` — phase/task field preservation,
    source_json passthrough, invalid dep/parent normalization (RF-1906).
  - `apps/api/tests/test_roadmap_projection_parity.py` — parity after create,
    full update/import-style replacement, restore, claim-field drift reporting,
    and backfill verification reporting (RF-1907).
  - `apps/api/tests/test_roadmap_projection_read_flag.py` — disabled-by-default check,
    parity-OK path, parity-failure fallback, and serialization-failure fallback (RF-1910).
  - Task PATCH, done PATCH, and claim/unclaim tests verify title, description,
    estimate, tags, ordered assignees, completion, claim identity/time,
    dependencies, and parent links. Dependency edge order remains intentionally
    non-canonical; parity compares dependency membership.

## Remaining

- Broader partial relational write endpoints remain deferred. Generic task editing,
  phase writes, dependencies, assignees, and task-tag replacement still use aggregate
  saves. Task claims have a focused snapshot-first route; tag registry CRUD writes the
  separate roadmap registry.
- RF-821 completion audit (2107) passed with minor follow-ups. The relational
  projection foundation is complete: projection tables remain derivative,
  `snapshot_json` remains canonical, backfill/verification is available, and
  guarded projection reads fall back safely.

## Validation Commands

Backend validation:

```bash
make api-test
make api-check
make api-lint
make check
```

Projection/operator verification:

```bash
make api-backfill-projection
VERIFY=1 make api-backfill-projection
VERIFY_ONLY=1 make api-backfill-projection
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
- The read-path flag is off by default and falls back to snapshots if projection parity
  or projection serialization fails.
- No frontend behavior changes are expected.
