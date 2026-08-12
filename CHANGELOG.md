# Changelog

All notable RoadForge changes are recorded here. Versions follow Semantic Versioning.
Dates use ISO format.

## Unreleased

Changes after the `0.1.0` baseline belong here.

### Security hardening

- Consolidate the 2026-08-12 Internet-facing threat model, findings, residual risks, and deployment proof requirements in `docs/security/internet-facing-audit-2026-08-12.md`.
- Move newly generated invite credentials from query strings to fragment URLs and scrub them from the active history entry after join bootstrap; retain query-token parsing only for migration compatibility.
- Move single-use SSE ticket transport from the EventSource query string to a 30-second, roadmap/participant-scoped, path-scoped HttpOnly cookie.
- Make viewer invite credentials reveal-once and remove plaintext viewer tokens from the live database through migration `0011`, which revokes legacy persisted viewer links before dropping `share_links.public_token`.
- Exchange browser participant Bearer sessions for roadmap-path-scoped `HttpOnly`, `SameSite=Strict`, production-`Secure` cookies before new credentials enter persistent browser state; automatically migrate legacy persisted browser Bearers after successful hydration.
- Preserve the roadmap-scoped Bearer only as a degraded recovery credential when the one-time browser cookie exchange fails, preventing newly created/joined server access from being orphaned while allowing later automatic migration.
- Require an explicitly configured Origin for unsafe cookie-authenticated roadmap requests while preserving the explicit Bearer API/MCP contract.
- Fail Redis-backed public rate limiting closed with `503` when Redis cannot perform the check instead of silently allowing the request.
- Mark sensitive roadmap `PATCH` responses `Cache-Control: no-store`.
- Align application and nginx baseline referrer/security headers and add compatible Compose runtime confinement: read-only web/API roots, capability drops, no-new-privileges, PID ceilings, and narrowly scoped tmpfs write paths.
- Pin maintained GitHub Actions to immutable upstream commit SHAs while retaining read-only validation permissions.
- Update the MCP client to prefer canonical `#token=` invite URLs while retaining legacy query-token parsing only as a compatibility fallback.
- Add cross-roadmap, role-change, browser-session/CSRF, invite transport, degraded session recovery, and realtime credential regression coverage.

## 0.1.0 - 2026-08-10

First supported RoadForge baseline for deliberate public release preparation.

### Product

- Local-first roadmap creation with scoped browser persistence.
- Explicit promotion from a local roadmap to a shared server roadmap.
- Accountless owner, editor, and viewer collaboration.
- Tasks, phases, dependencies, assignees, tags, external links, claims, activity, and bounded restore history.
- Portable JSON import/export and deterministic Markdown export.
- Compact first-run template rather than an internal engineering backlog.
- Clear recovery states for offline saves, conflicts, storage failures, and access changes.

### Reliability and data integrity

- Exact optimistic-concurrency checks for roadmap, task, tag, and restore writes.
- Server-side roadmap graph validation and deterministic browser import repair.
- PostgreSQL canonical snapshots with rebuildable relational projections.
- Incremental/focused task and tag mutation paths while preserving the portable snapshot contract.
- Redis-backed multi-worker coordination for realtime events, locks, tickets, revocation checks, and rate limits.
- Production container builds run as non-root users.

### Quality and contribution foundation

- Web unit tests, browser smoke/accessibility coverage, API integration tests, migration drift checks, dependency audits, MCP protocol checks, production container builds, and deployment validation in CI.
- Contributor guide, pull-request template, structured issue forms, security reporting, support policy, manual QA, and self-hosting documentation.
- Node 24 reference development/CI runtime and Python 3.12 API runtime.

### Security boundaries

- Opaque roadmap-scoped bearer credentials are hashed at rest.
- Explicit CORS and trusted-proxy validation for production deployments.
- Credential-safe application/proxy logging guidance.
- Streamed request-body limits and action-specific rate limiting.
- Short-lived one-time SSE tickets keep participant session tokens out of event URLs.

### Known boundaries at the 0.1.0 baseline

- Browser-local data can be removed with site storage; important roadmaps should be exported as JSON.
- `roadforge.anvilary.tools` is a demo/convenience deployment, not a managed backup service.
- The MCP package remains experimental and reuses roadmap participant credentials.
- The repository is currently PolyForm Noncommercial source-available software; that license is not OSI-approved open source.
