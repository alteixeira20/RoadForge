# RoadForge release checklist

Use this checklist for `0.1.0` and later releases. Run it against one frozen candidate
revision. If the candidate changes, rerun every gate affected by the change.

## Candidate record

```text
Version:
Candidate SHA:
Branch:
Frozen at (UTC):
Release manager:
Rollback revision:
Target environment:
```

## 1. Freeze

- [ ] Feature work is frozen for the candidate.
- [ ] Only release blockers/regression fixes are accepted after the freeze.
- [ ] `git status --short` is clean.
- [ ] The recorded candidate SHA matches `git rev-parse HEAD`.
- [ ] Version and changelog describe the candidate accurately.

## 2. Automated evidence

- [ ] `make release-check` passes.
- [ ] Full development Playwright suite passes without unresolved failures.
- [ ] Production hydration/browser smoke passes.
- [ ] API PostgreSQL-backed tests pass.
- [ ] Real-Redis collaboration/revocation tests pass.
- [ ] Alembic upgrade/schema drift checks pass.
- [ ] JavaScript dependency audit passes at the configured severity threshold.
- [ ] Python dependency audit passes at the configured severity threshold.
- [ ] MCP package/protocol checks pass when the package is included in the release candidate.
- [ ] Production API and web images build.
- [ ] Production containers run as non-root users.
- [ ] Self-hosted Compose configuration validates.
- [ ] Every required GitHub Actions job is green for the exact candidate SHA.

A retry can demonstrate that a runner failure was transient, but recurring flaky tests
remain a release-quality problem and should be fixed rather than normalized.

## 3. Product and data contract

- [ ] Local-first creation works without the API.
- [ ] JSON export/import round-trip preserves meaningful roadmap data.
- [ ] Markdown export is credential-free and remains non-importable.
- [ ] Hosted/demo copy advises users to keep JSON backups they control.
- [ ] The Anvilary-hosted instance does not imply managed backup/durability guarantees.
- [ ] Accountless owner/editor/viewer semantics remain accurate.
- [ ] Roadmap snapshot/tag-registry source-of-truth rules remain accurate.
- [ ] No current documentation teaches the internal RoadForge roadmap as the starter template.
- [ ] No current documentation reintroduces historical 512 KiB request limits.

## 4. Local manual QA

Complete [docs/manual-qa.md](../docs/manual-qa.md) against the candidate, including:

- [ ] local-only creation/persistence;
- [ ] starter template;
- [ ] promotion to server sync;
- [ ] owner/editor/viewer join and authorization;
- [ ] share-link rotation/revocation and participant revocation;
- [ ] realtime propagation and reconnect;
- [ ] optimistic-concurrency conflict recovery;
- [ ] activity/checkpoint/version restore;
- [ ] import safety and historical compatibility;
- [ ] keyboard/responsive/accessibility smoke;
- [ ] browser storage failure behavior;
- [ ] 5 MiB payload boundary behavior.

Record the browser and assistive-technology combinations used for manual accessibility
smoke testing.

## 5. Deployment preflight

- [ ] Production PostgreSQL credentials are non-development values.
- [ ] `ROADFORGE_ENVIRONMENT=production` is set.
- [ ] `ROADFORGE_CORS_ORIGINS` is explicit.
- [ ] `ROADFORGE_TRUSTED_PROXY_IPS` is narrow and correct.
- [ ] HTTPS termination is configured.
- [ ] PostgreSQL and Redis are private/not directly exposed.
- [ ] Memory realtime is one API process only, or Redis mode is enabled for multi-worker/instance deployment.
- [ ] A PostgreSQL backup and checksum are created before schema-sensitive migration.
- [ ] Backup restore has been rehearsed against a disposable database.

## 6. Health contract

After deployment:

- [ ] `/api/health/live` returns 200 for process liveness.
- [ ] `/api/health/ready` returns 200 with PostgreSQL/configured Redis ready.
- [ ] `/api/health` behaves as the backward-compatible readiness alias.
- [ ] Dependency failure produces readiness failure without exposing connection details.

Do not certify a deployment from `/live` alone.

## 7. Security and logging

- [ ] HTTPS/HSTS behavior is correct at the public edge.
- [ ] Expected production security headers are present.
- [ ] Frontend CSP is accurately reported as report-only for `0.1.0` unless the tracked enforced-CSP work has landed and passed its dedicated tests.
- [ ] API application logs contain no request query strings, credentials, headers, or bodies.
- [ ] Maintained proxy access logs omit query strings and `Referer`.
- [ ] Upstream proxy/tunnel/CDN logging has been reviewed for invite-token exposure.
- [ ] Session/invite/password/Redis credentials do not appear in exports or release evidence.

## 8. Deployed collaboration smoke

Using independent browser contexts:

- [ ] Owner creates/saves a roadmap.
- [ ] Editor joins and edits.
- [ ] Viewer joins and remains read-only.
- [ ] Cross-context changes propagate through realtime.
- [ ] Participant revocation terminates access.
- [ ] Stale writes produce explicit conflicts rather than overwrite.
- [ ] JSON export/import works through the deployed frontend.

## 9. Known-boundary review

Before publishing release notes, explicitly review:

- [ ] browser-local storage durability limitations;
- [ ] hosted-demo/no-managed-backup positioning;
- [ ] report-only CSP status;
- [ ] soft-delete/final-retention status;
- [ ] Python dependency-lock status;
- [ ] MCP credential/publishing status;
- [ ] current repository license and whether it is being described accurately.

No known boundary may be omitted merely to make the release appear more complete.

## 10. Release artifacts

- [ ] Version is correct in maintained package/application metadata.
- [ ] `CHANGELOG.md` is finalized.
- [ ] Release notes include major capabilities, upgrade notes, known boundaries, and verification evidence.
- [ ] Tag is created on the exact frozen candidate SHA.
- [ ] Published artifacts, if any, match the tagged source.

Suggested release-note structure:

```markdown
## RoadForge <version>

<What this release establishes and who it is for.>

### Included
- <user-visible capability>

### Data ownership
The hosted Anvilary instance is a demo/convenience deployment. Export important
roadmaps as JSON and keep copies you control.

### Known boundaries
- <current boundary>

### Upgrading / self-hosting
- Back up PostgreSQL before schema-sensitive updates.
- Apply migrations to Alembic head.
- Application rollback does not automatically reverse migrations.

### Verified
- Candidate SHA: <sha>
- CI: <result>
- Browsers: <matrix>
- Accessibility smoke: <matrix>
- Backup/restore: <result>
```

## 11. Post-deploy observation

For a public deployment, observe at least through the first normal usage window.

- [ ] health/readiness remains stable;
- [ ] no restart loop or sustained 5xx appears;
- [ ] realtime still propagates;
- [ ] storage/database usage is sane;
- [ ] no credentials appear in logs;
- [ ] no data-loss/corruption report remains unexplained.

Roll back immediately for credible data corruption/loss, credential exposure,
unrecoverable save failures, broken primary routes, or sustained dependency failure.

## 12. Close-out

- [ ] Final release notes are published.
- [ ] Verification evidence is retained with credentials/private roadmap data redacted.
- [ ] New defects discovered during release/deployment are filed with a clear owner/disposition.
- [ ] Feature work reopens only after the `0.1.0` baseline is frozen and documented.
