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
- [ ] Release version/toolchain contract passes.
- [ ] Documentation/copy/issue-form contract passes when contributor/docs paths changed.
- [ ] Full development Playwright suite passes without unresolved failures.
- [ ] Production CSP/core-flow browser suite passes with enforcement enabled.
- [ ] API dependency lock accepts `uv lock --check` and deterministic frozen export.
- [ ] API PostgreSQL-backed tests pass from the locked Python graph.
- [ ] Real-Redis collaboration/revocation tests pass from the locked Python graph.
- [ ] Alembic upgrade/schema drift checks pass from the locked Python graph.
- [ ] JavaScript dependency audit passes at the configured severity threshold or has only a documented unexpired exact-advisory exception.
- [ ] Locked Python runtime dependency audit passes at the configured severity threshold.
- [ ] MCP package/protocol checks pass when the package is included in the release candidate.
- [ ] Production API and web images build.
- [ ] Production containers run as non-root users.
- [ ] Self-hosted Compose configuration validates, including CSP runtime wiring.
- [ ] Every required GitHub Actions job is green for the exact candidate SHA.

A retry can demonstrate that a runner failure was transient, but recurring flaky tests
remain a release-quality problem and should be fixed rather than normalized.

## 3. Product and data contract

- [ ] Local-first creation works without the API.
- [ ] JSON export/import round-trip preserves meaningful roadmap data.
- [ ] Markdown export is credential-free and remains non-importable.
- [ ] Hosted/demo copy advises users to keep JSON backups they control.
- [ ] The Anvilary-hosted instance does not imply managed backup/durability guarantees.
- [ ] Synced deletion wording distinguishes immediate soft deletion, final live-database purge, and independent backup retention.
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
- [ ] `ROADFORGE_CSP_MODE` is deliberately set for observation/enforcement rollout.
- [ ] HTTPS termination is configured.
- [ ] PostgreSQL and Redis are private/not directly exposed.
- [ ] Memory realtime is one API process only, or Redis mode is enabled for multi-worker/instance deployment.
- [ ] A PostgreSQL backup and checksum are created before schema-sensitive migration or planned retention purge.
- [ ] Backup restore has been rehearsed against a disposable database.

## 6. Health contract

After deployment:

- [ ] `/api/health/live` returns 200 for process liveness.
- [ ] `/api/health/ready` returns 200 with PostgreSQL/configured Redis ready.
- [ ] `/api/health` behaves as the backward-compatible readiness alias.
- [ ] Dependency failure produces readiness failure without exposing connection details.

Do not certify a deployment from `/live` alone.

## 7. Security, CSP, and logging

- [ ] HTTPS/HSTS behavior is correct at the public edge.
- [ ] Expected production security headers are present.
- [ ] CSP report-only observation has been run for the exact candidate when required by the rollout policy.
- [ ] Final candidate deployment emits one enforced `Content-Security-Policy` header and no conflicting report-only/proxy policy.
- [ ] Production `script-src` uses a per-response nonce and contains neither `unsafe-inline` nor `unsafe-eval`.
- [ ] Nonce-bearing HTML is `private, no-store`; page reloads receive fresh nonces.
- [ ] Create/import/export/share/join/realtime flows produce no unexpected CSP browser violations.
- [ ] API application logs contain no request query strings, credentials, headers, or bodies.
- [ ] Maintained proxy access logs omit query strings and `Referer`.
- [ ] Upstream proxy/tunnel/CDN logging has been reviewed for invite-token exposure.
- [ ] Session/invite/password/Redis credentials do not appear in exports or release evidence.

If legitimate app behavior is blocked under enforcement, roll the deployment back to
`ROADFORGE_CSP_MODE=report-only` on the same build while fixing the specific policy issue.
Do not add broad production script exceptions.

## 8. Deployed collaboration smoke

Using independent browser contexts:

- [ ] Owner creates/saves a roadmap.
- [ ] Editor joins and edits.
- [ ] Viewer joins and remains read-only.
- [ ] Cross-context changes propagate through realtime.
- [ ] Participant revocation terminates access.
- [ ] Stale writes produce explicit conflicts rather than overwrite.
- [ ] JSON export/import works through the deployed frontend.

## 9. Retention and recovery

For a deployment that already contains synced data:

- [ ] retention dry-run succeeds before release;
- [ ] emitted policy/as-of/counts are recorded without roadmap/user/token data;
- [ ] active and recently deleted roadmaps are not unexpectedly selected;
- [ ] saturated batch counts are investigated rather than bypassed with unbounded deletion;
- [ ] no destructive purge is performed merely to prove release readiness;
- [ ] any planned purge has a current verified PostgreSQL backup first.

Final live-database purge is an operator lifecycle action and remains independent from
backup expiry. Never imply that a live purge automatically removes historical backup copies.

## 10. Known-boundary review

Before publishing release notes, explicitly review:

- [ ] browser-local storage durability limitations;
- [ ] hosted-demo/no-managed-backup positioning;
- [ ] inline CSS remains an explicit CSP compatibility boundary;
- [ ] nonce-bearing HTML is dynamically rendered/no-store rather than CDN-cacheable;
- [ ] soft-delete/final-live-purge/backup-retention semantics;
- [ ] temporary dependency-advisory exceptions are documented and unexpired;
- [ ] MCP credential/publishing status;
- [ ] current repository license and whether it is being described accurately.

No known boundary may be omitted merely to make the release appear more complete.

## 11. Release artifacts

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
- Back up PostgreSQL before schema-sensitive updates or retention purge.
- Apply migrations to Alembic head.
- Application rollback does not automatically reverse migrations.
- CSP can be returned to report-only on the same build if a legitimate flow is blocked.

### Verified
- Candidate SHA: <sha>
- CI: <result>
- Browsers: <matrix>
- CSP report-only observation: <result>
- CSP enforcement: <result>
- Retention dry-run: <result>
- Accessibility smoke: <matrix>
- Backup/restore: <result>
```

## 12. Post-deploy observation

For a public deployment, observe at least through the first normal usage window.

- [ ] health/readiness remains stable;
- [ ] no restart loop or sustained 5xx appears;
- [ ] realtime still propagates;
- [ ] storage/database usage is sane;
- [ ] no unexpected CSP enforcement errors appear;
- [ ] retention dry-run trends are plausible for the deployment;
- [ ] no credentials appear in logs;
- [ ] no data-loss/corruption report remains unexplained.

Roll back immediately for credible data corruption/loss, credential exposure,
unrecoverable save failures, broken primary routes, or sustained dependency failure.
For a CSP-only compatibility regression, use the documented report-only rollback rather
than rolling back unrelated database/application changes first.

## 13. Close-out

- [ ] Final release notes are published.
- [ ] Verification evidence is retained with credentials/private roadmap data redacted.
- [ ] New defects discovered during release/deployment are filed with a clear owner/disposition.
- [ ] Feature work reopens only after the `0.1.0` baseline is frozen and documented.
