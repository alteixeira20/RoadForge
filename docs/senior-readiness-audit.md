# RoadForge senior-readiness audit

This document is the review entry point for a senior engineer evaluating the
RoadForge public alpha. It records the architecture that must remain true, the
automated evidence expected from every candidate, and the risks that are
accepted only because the product is explicitly pre-release.

## Review order

1. Read this document and [`architecture/overview.md`](architecture/overview.md).
2. Review the access and threat model in [`access-model.md`](access-model.md) and
   [`public-deployment-security.md`](public-deployment-security.md).
3. Inspect canonical writes in `apps/api/src/api/services/roadmap_service.py`,
   task writes in `roadmap_task_service.py`, and compare-and-swap enforcement in
   `roadmap_concurrency.py`.
4. Inspect browser hydration/persistence in `apps/web/src/lib/storage.ts`,
   `useRoadmapHydration.ts`, and `RoadmapContext.tsx`.
5. Review projection parity and backfill logic before enabling projection reads.
6. Review the bounded MCP surface in `packages/roadforge-mcp`.
7. Require a green exact-head CI run and complete the deployed manual checks in
   [`manual-qa.md`](manual-qa.md).

## Architecture invariants

### Local-first browser data

A new roadmap is browser-local until the user explicitly enables server sync.
The local roadmap cache is canonical for that mode. Browser storage failures are
therefore surfaced as a persistent alert; they must never be silently represented
as successful persistence. Important local roadmaps still require JSON exports
because browser site data can be removed externally.

### Server canonical source

For synced roadmaps, `Roadmap.snapshot_json` and `tag_registry_json` are the
canonical current document. Relational phase/task rows are a derivative projection
for future query efficiency. Projection drift must not corrupt canonical reads and
can be repaired from the snapshot.

### Concurrency

Every content mutation uses the server's exact `updated_at` compare-and-swap token.
A stale or future client token is rejected. Agents and browsers use the same
contract; neither silently rebases or retries a conflicting write.

### Identity and authorization

RoadForge is accountless. An invite is exchanged for a roadmap-scoped participant
session. Tokens are opaque bearer credentials, hashed at rest, role-scoped, and
revocable. Display names are labels, not verified identities. The design must not
imply account-level ownership, global identity, or recovery guarantees that do not
exist.

### Storage economics

Ordinary edits update the current canonical snapshot and activity evidence.
Full restore points are created only for meaningful lifecycle operations and are
capped. Normal task writes update only affected projection rows; full roadmap saves
synchronize rows in place rather than recreating them.

### MCP boundary

The MCP package is a local stdio adapter over the existing participant-scoped API.
It receives credentials through the host environment, never through tool arguments,
and defaults to bounded summaries/searches. It does not create a second identity
system or grant access to browser-only roadmaps.

## Automated evidence matrix

A merge candidate must pass all permanent CI jobs on its exact head SHA:

| Area | Required evidence |
|---|---|
| Web quality | product-copy checks, import-cycle checks, docs/issues validation, ESLint, TypeScript, production build |
| Web behavior | unit tests, full development Playwright suite, production hydration smoke |
| API quality | Ruff and Python compilation |
| API behavior | complete PostgreSQL-backed test suite |
| Multi-worker path | revocation/realtime tests against a real Redis service |
| Schema | Alembic upgrade and `alembic check` |
| Supply chain | production JavaScript and Python dependency audits |
| Packaging | MCP protocol tests and npm package dry-run |
| Deployment | API/web image builds, non-root runtime users, Compose config validation |

Every CI job is bounded by a timeout. A hanging browser or service test is a failed
release gate, not an indefinitely pending success.

## Health and operability

- `/api/health/live` proves only that the API process can answer.
- `/api/health/ready` verifies PostgreSQL and, when configured, Redis.
- `/api/health` remains a readiness-compatible alias for existing deployments.
- Dependency failures return `503` without exposing connection details.
- Docker health checks should use readiness; orchestration liveness probes may use
  the dedicated liveness endpoint.

## Security posture

Implemented controls include scoped bearer authorization, hashed tokens, PBKDF2
roadmap passwords, strict production CORS validation, request body streaming limits,
rate limiting, SSE tickets, security headers, non-root containers, query-free access
logs, dependency audits, and explicit trusted-proxy configuration.

The most consequential residual security risk is script injection because session
credentials live in browser storage. CSP is report-only while a nonce-compatible
Next.js strategy is designed. Do not claim hardened general availability before an
enforced CSP is implemented and tested.

## Accepted public-alpha limitations

These are visible product boundaries, not hidden defects:

- no user accounts, email recovery, or verified identity;
- invite tokens appear in URLs and may be retained by upstream infrastructure;
- browser-local data depends on browser storage and user-maintained exports;
- soft-deleted roadmaps have no automated hard-purge policy yet;
- Python dependencies are audited but not yet installed from a committed generated
  lock;
- activity history is not an immutable cryptographic audit ledger;
- MCP integration uses participant credentials rather than dedicated integration
  credentials and is not yet published to npm;
- CSP is report-only;
- production deployment and multi-browser collaboration still require manual
  environment validation.

## Release checklist

- [ ] Exact PR head SHA is recorded and unchanged.
- [ ] Every permanent CI job is successful.
- [ ] Database backup exists before schema-sensitive deployment.
- [ ] Migrations run to current Alembic head.
- [ ] `/api/health/live` and `/api/health/ready` behave correctly.
- [ ] Owner, editor, viewer, revoke, conflict, and realtime flows are exercised in
      independent browser contexts.
- [ ] Local browser storage refusal displays the persistence warning.
- [ ] JSON export/import round-trip is manually verified with a non-trivial roadmap.
- [ ] Production reverse-proxy logs do not contain invite query strings or referrers.
- [ ] MCP is connected through a real host using the minimum required role.
- [ ] Known limitations are reflected in release notes and public copy.

## Deferred work requiring explicit design

The following should be tracked and reviewed independently rather than slipped into
an unrelated feature change:

1. Generate and enforce a reproducible Python dependency lock in CI and Docker.
2. Implement nonce-based enforced CSP without breaking Next.js hydration.
3. Define and implement soft-delete/activity retention and operator purge tooling.
4. Add dedicated scoped MCP integration credentials, rotation, and attribution.

A green CI run does not prove the absence of every defect. It proves that the
specified contracts were exercised on one exact revision; senior review and deployed
manual validation remain mandatory.
