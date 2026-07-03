# RoadForge Project Audit

Audit date: 2026-06-13

> Historical audit. RoadForge now uses the **Public Alpha** release label. References
> to a future beta milestone describe a later release gate, not the current release.

## Executive conclusion

RoadForge has a credible beta foundation: the local-first roadmap model, accountless
sharing, role-scoped sessions, relational projection, partial task writes, realtime
events, import safety work, deployment manifests, and CI definitions are already
substantial.

At the time of this audit, it was not ready for a public deployment. The main blockers were:

1. The current MIT license permits commercial use, which conflicts with the intended
   non-commercial distribution policy.
2. The in-progress tag registry has two competing write contracts and gaps in
   concurrency, activity, realtime, import, and validation behavior.
3. Task claims allow editors to silently replace or remove another editor's claim.
4. Production proxy trust is documented but not passed into the API container, which
   can collapse client-IP rate limiting behind a reverse proxy.
5. No validation evidence exists for the current working tree, and the latest committed
   SHA has no GitHub Actions runs associated with it.
6. The product and repository did not consistently identify the release as pre-release/WIP.

The correct current launch description is **source-available Public Alpha software**, not open-source
software, if commercial use remains prohibited. The Open Source Definition requires
licenses to permit use in business and other fields of endeavor. PolyForm
Noncommercial 1.0.0 is a reasonable candidate for the requested policy, subject to
maintainer review and legal advice.

## Audit scope

This audit reviewed:

- repository structure and working-tree state;
- architecture and data ownership;
- API authorization, concurrency, rate limiting, and realtime behavior;
- frontend state flow, accessibility, and import/export behavior;
- migrations, tests, CI configuration, and deployment manifests;
- security and operations documentation;
- license, repository community files, release copy, and public-launch readiness;
- all remaining tasks in `roadmaps_app_roadmap.json`.

No build, test, audit, migration, install, deployment, or server command was run. The
findings are based on static inspection and GitHub repository metadata.

## Current-state snapshot

- GitHub repository: `alteixeira20/RoadForge`
- Visibility: private
- Default branch: `main`
- Audited HEAD: `9b762953ca5e9f30a247a7de90a3a26853cae089`
- HEAD date: 2026-06-01
- Current roadmap export: 439 tasks, 311 complete, 128 open
- Current tree: substantial uncommitted tag-registry work across API, web, migration,
  tests, styles, and roadmap data
- CI workflow: quality, API lint, syntax, migration drift, API tests, dependency audits,
  and web unit tests are defined
- CI evidence: no workflow runs were returned for the audited HEAD

The uncommitted files are treated as active project work and must be preserved.

## What is already solid

### Product and architecture

- Local-first editing with a server-backed collaboration path is clearly established.
- The accountless owner/editor/viewer access model is documented and implemented.
- Sensitive writes use participant authorization and role checks.
- Snapshot JSON remains canonical while relational projection supports incremental
  migration without prematurely replacing the existing persistence model.
- Task completion and task claiming have focused partial-write endpoints.
- Realtime events, lock handling, activity history, version history, and participant
  revocation exist.
- Import/merge safety has dedicated architecture documentation and test coverage.

### Security and operations

- Production startup rejects unsafe defaults.
- PostgreSQL and Redis are isolated on an internal container network.
- API documentation is disabled outside development in application code.
- Security headers, HSTS behavior, no-store API responses, rate limiting, session
  expiry, and dependency-audit policies are present.
- Deployment configuration requires explicit production secrets and origins.
- CI definitions cover the major frontend, backend, migration, and dependency gates.

### Engineering process

- The repository has focused architecture notes and manual QA documents.
- Alembic migration discipline and schema-drift checks are defined.
- Existing roadmap work records deferred refactors rather than mixing them into feature
  slices.

## Launch-blocking findings

### RF-AUD-001: License and public copy contradict the requested policy

Severity: blocker

`LICENSE` is MIT, and the landing page and footer advertise MIT licensing. MIT permits
commercial use and sale. A no-commercial-use restriction is not compatible with the
Open Source Definition, so the project must use the term `source-available`.

Required work:

- replace MIT with a reviewed non-commercial source-available license;
- add an explicit copyright and required notice;
- update package metadata, README, landing copy, footer, and self-hosting docs;
- explain that previously distributed MIT copies retain the rights already granted;
- decide whether separate commercial licenses will be offered.

### RF-AUD-002: Tag registry writes are not a coherent collaboration contract

Severity: blocker

The in-progress implementation stores `tag_registry_json` and also exposes tag CRUD
endpoints, while the current UI mutates the registry through the full-roadmap autosave
path. The CRUD path does not currently participate in optimistic concurrency, activity
history, normal route rate limits, or actor-aware realtime events.

Additional correctness gaps:

- realtime refetch does not hydrate the tag registry;
- replace import can retain the previous registry when the imported registry is empty;
- new-local import drops the imported registry;
- arbitrary task tags are not consistently added to the registry;
- identifiers and colors are insufficiently normalized and validated;
- merge conflict reporting does not cover same-label or color conflicts;
- reorder behavior is absent;
- exports can omit definitions for tags still used by tasks.

Required work:

- define one canonical write and concurrency contract;
- normalize and validate tag IDs, labels, colors, ordering, and limits;
- cover activity, realtime, import, export, merge, and local-only behavior;
- update tests to assert the final contract rather than the current draft behavior.

### RF-AUD-003: Task claims can be silently taken over

Severity: blocker

Any editor can currently replace or remove another participant's claim. The UI presents
this as “take over,” but there is no ownership conflict, confirmation, owner-only
override, activity distinction, or stale-claim policy.

Required work is specified in
`docs/architecture/task-claiming-collaboration-audit.md`.

### RF-AUD-004: Reverse-proxy client IP trust is not wired into production Compose

Severity: blocker

`deploy/hosting-bay/.env.example` documents `ROADFORGE_TRUSTED_PROXY_IPS`, but
`deploy/hosting-bay/compose.yaml` does not pass it to the API service. Behind a tunnel
and reverse proxy, participant creation and join rate limits can use the proxy peer as
the client identity, causing unrelated users to share one rate-limit bucket.

Required work:

- pass the setting into the API container;
- document the exact trusted proxy CIDR for the deployed topology;
- reject unsafe wildcard trust;
- verify the observed client identity through the full proxy chain;
- ensure proxy logs do not retain invite-token query strings.

### RF-AUD-005: The current tree has no release-quality validation evidence

Severity: blocker

The working tree includes a migration, API contract changes, frontend state changes,
and new tests. The repository defines appropriate validation gates, but none were run
as part of this audit, and GitHub returned no Actions runs for the current HEAD.

Required work:

- complete focused implementation review first;
- run formatting, lint, typecheck, web tests, API tests, migration upgrade/drift checks,
  dependency audits, and production builds with explicit approval;
- deploy a release candidate to an isolated beta environment;
- execute the documented manual QA and security matrices.

### RF-AUD-006: Beta/WIP status is inconsistent

Severity: blocker

The README says “manual-testing candidate” and “pre-production,” metadata says only
“RoadForge,” and the footer says `v0.1`. The landing page contains “Source coming soon”
placeholders and disabled resource links.

Required work:

- use a consistent pre-release label (now `Public Alpha · Work in Progress`);
- add stability, data-backup, breaking-change, and support expectations;
- expose real repository, docs, self-hosting, security, and changelog links;
- label the hosted instance and public roadmap viewer clearly;
- avoid claims of production readiness.

## High-priority findings

### RF-AUD-007: Public repository foundation is incomplete

- The GitHub repository is private.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `CHANGELOG.md` are missing.
- Issue templates, pull-request template, release checklist, and support guidance are
  missing.
- `SECURITY.md` contains a placeholder instead of a usable private contact channel.

### RF-AUD-008: Accessibility fundamentals need a focused pass

- The shared modal restores focus and handles Escape, but does not trap focus.
- Toasts do not expose a live region.
- The task completion control is a clickable `div`, not a native button or checkbox.
- Interactive-control button types and keyboard behavior need a repository-wide audit.
- Automated checks cannot replace keyboard, screen-reader, zoom, and reduced-motion QA.

### RF-AUD-009: Request body limiting relies on the proxy

The API middleware only checks `Content-Length`, does not consume chunked bodies, and
parses the header without handling malformed values. The production proxy must enforce
the real body limit, and the middleware should fail predictably for invalid headers.

### RF-AUD-010: Security policy enforcement and documentation have drift

- CSP remains report-only while older docs describe it as deferred.
- Reverse-proxy and API-documentation statements are not fully aligned with runtime
  behavior.
- README vulnerability claims are point-in-time assertions without current evidence.
- The security contact and incident/release process are incomplete.

### RF-AUD-011: Large modules raise change risk

Current hotspots include:

- `apps/api/src/api/services/roadmap_service.py`;
- `apps/api/src/api/routers/roadmaps.py`;
- `apps/api/src/api/services/projection_service.py`;
- `apps/web/src/components/roadmap/Workspace.tsx`;
- `apps/web/src/components/roadmap/TaskRow.tsx`;
- `apps/web/src/lib/roadmap-validation.ts`.

The roadmap already contains appropriately scoped refactor tasks. These should be done
after the tag and filtering contracts stabilize and before final QA.

### RF-AUD-012: Documentation contains obsolete integration guidance

`docs/frontend-foundation.md` still describes backend integrations as TODOs even though
many are implemented. `docs/next-slices.md`, deployment notes, and API documentation
need a current-state review before public release.

## Roadmap audit

The remaining 128 tasks combine four different horizons:

1. Existing-feature correctness: task claims, tags, filtering, and pre-QA polish.
2. Product identity and release: Anvilary rebrand, public sharing, SEO, source release,
   and launch stabilization.
3. New platform scope: accounts, OAuth, workspaces, telemetry, administration, and
   possible subscriptions.
4. Post-beta enhancements: richer exports, saved views, duplication, advanced conflict
   resolution, and assistant integrations.

Treating all 128 tasks as a single beta gate would delay feedback and expand security
scope significantly. Accounts, OAuth, workspaces, telemetry, billing exploration, and
advanced exports are not prerequisites for an honest accountless beta.

Roadmap hygiene issues:

- Phase 28 is complete but still marked active.
- Phase 29 has one audit task open but is marked future.
- The tag registry implementation is underway while all phase 30 tasks remain open.
- No remaining task is marked as the recommended next task.
- Some launch tasks depend on external credentials, DNS, hosted infrastructure, brand
  assets, or maintainer policy decisions.

## Recommended execution order

### Foundation gate

1. Resolve task-claim ownership, override, stale-claim, and merge rules.
2. Finish the tag registry as one coherent end-to-end contract.
3. Fix trusted-proxy configuration and request-body edge cases.
4. Normalize roadmap task status and mark completed implementation accurately.
5. Complete the deferred modular refactors that reduce risk in the save, hydration,
   workspace callback, and backend service paths.

### Product beta gate

1. Complete filtering and pre-QA interaction polish.
2. Apply the chosen RoadForge/Anvilary product identity consistently.
3. Add explicit `Public Alpha · Work in Progress` messaging and user expectations.
4. Complete public read-only sharing and stable URL behavior.
5. Add truthful metadata, social assets, sitemap/robots rules, and public docs.

### Source release gate

1. Adopt and document the non-commercial source-available license.
2. Add contribution, conduct, security, support, changelog, issue, PR, and release files.
3. Publish architecture and self-hosting guides.
4. Perform secret, generated-file, dependency, and repository-history hygiene reviews.
5. Make the GitHub repository public only after the license and history review.

### Verification and launch gate

1. Run automated validation with explicit approval.
2. Deploy to staging and perform migrations against a disposable or backed-up database.
3. Run manual functional, collaboration, import, accessibility, security, performance,
   and multi-worker tests.
4. Fix all beta blockers and document accepted limitations.
5. Publish a beta release and hosted instance without describing it as stable.

### Post-beta scope

Account identity, OAuth, workspaces, telemetry, cost accounting, subscriptions, and
advanced product improvements should proceed as separate milestones after the
accountless beta unless they are intentionally promoted into the beta definition.

## Beta launch criteria

RoadForge can advance from Public Alpha to beta when:

- license and terminology are accurate;
- no known blocker in this audit remains open;
- tag and claim collaboration contracts are deterministic and tested;
- production proxy, secrets, origins, backups, and migrations are verified;
- all required automated gates pass on the release commit;
- the manual QA matrix passes or records explicit beta limitations;
- security reporting works;
- the repository and hosted UI clearly say `Beta` and `Work in Progress`;
- users are warned to export backups and expect breaking changes;
- the release has a changelog, version identifier, rollback procedure, and owner.

## External dependencies and decisions

The following cannot be completed solely through repository code:

- legal review of the final license and copyright ownership;
- a private security-reporting email or enabled GitHub private reporting;
- DNS, TLS, tunnel, hosting, backup, and monitoring access;
- OAuth application credentials if account features enter scope;
- final Anvilary brand assets and naming approval;
- changing GitHub visibility and publishing a release;
- approval to run state-changing validation and deployment commands.

These are launch inputs, not reasons to weaken the implementation foundation.
