# Public Alpha Release Checklist

Run once against the final release candidate. Record the candidate revision,
operator, environment, and result beside the release ticket.

## Freeze and automated gate

- [ ] Final QA patch window is active: accept blocker/regression fixes only; no
  new features.
- [ ] `git status --short` is clean and the candidate revision is recorded.
- [ ] `make release-check` passes without skipped steps.
- [ ] CI is green for the candidate; dependency-audit results are reviewed.
- [ ] Version, changelog, Public Alpha/WIP wording, license terminology, demo
  data, and secret/generated-artifact scan are reviewed.

## Deploy preflight

- [ ] Follow the [hosting-bay deployment preflight](../deploy/hosting-bay/README.md#validation);
  production secrets, URLs, trusted proxies, HTTPS, and health checks are valid.
- [ ] Back up PostgreSQL and prove the restore procedure using
  [self-hosting backup guidance](../docs/self-hosting.md#backups-and-updates).
- [ ] Migration upgrade, drift check, and projection backfill/parity complete;
  `roadmaps.snapshot_json` remains canonical and projections remain derivative.
- [ ] Confirm `ROADFORGE_API_WORKERS=1` for memory mode. For multiple workers or
  API instances, confirm `ROADFORGE_REALTIME_BACKEND=redis`, Redis connectivity,
  and the [RF-886 regression checklist](../docs/manual-qa.md#30b--rf-886-multi-worker-realtime-regression-checklist).

## Final browser QA

- [ ] Run the [owner/editor/viewer setup and role checks](../docs/manual-qa.md#setup)
  through sharing, joining, read-only enforcement, and two-session realtime.
- [ ] Run [task creation/editing/PATCH QA](../docs/manual-qa.md#11--task-creation--editing--done-state),
  [lock/idle draft preservation](../docs/manual-qa.md#12--task-edit-locks), and
  [409 recovery](../docs/manual-qa.md#25--409-conflict-recovery).
- [ ] Run [JSON export](../docs/manual-qa.md#18--export-json) and
  [replace-current import](../docs/manual-qa.md#19--import-replace-current-roadmap);
  verify the checkpoint, roadmap identity, tags, dependencies, subtasks, claims,
  descriptions, estimates, assignees, and done/next state survive.
- [ ] Run [version read/restore](../docs/manual-qa.md#22--version-history):
  owner restores, editor reads but cannot restore, viewer cannot read versions.
- [ ] Browser automation is deferred per the
  [Public Alpha recommendation](../docs/architecture/browser-smoke-automation.md);
  this manual QA is authoritative.
- [ ] GitHub task links: deferred placeholder for RF-607; do not block Public
  Alpha and do not expect `task.links` in import/export.

## Release decision and rollback

- [ ] Blockers are zero. Non-blocking defects are documented with owner and
  disposition; fixes restart affected checks.
- [ ] Release notes state the
  [known acceptable limitations](../docs/manual-qa.md#known-acceptable-limitations)
  and advise users to export important roadmaps.
- [ ] Staging candidate is approved before production.
- [ ] Rollback revision and operator are assigned. Follow
  [rollback notes](../deploy/hosting-bay/README.md#rollback-notes); application
  rollback does not reverse migrations, so restore PostgreSQL when required.
- [ ] Post-deploy health, owner create/save/share, editor join/edit, viewer
  read-only, and realtime checks pass on the public environment.
