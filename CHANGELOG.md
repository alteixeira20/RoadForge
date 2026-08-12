# Changelog

All notable RoadForge changes are recorded here. Versions follow Semantic Versioning.
Dates use ISO format.

## Unreleased

Changes after the `0.1.0` baseline belong here.

### Security hardening

- Follow up the Internet-facing audit with HTTPS-only production frontend origins, bounded concurrent SSE streams and slow-consumer queues, per-invite active-session ceilings, a total server roadmap-record ceiling, bounded activity/version-history storage, and terminal SSE authorization on roadmap deletion/session expiry.
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

### Product and visual refinements

- Add an ordered five-level task complexity signal (`Very low` → `Very high`), default legacy tasks to `Medium`, require very-high top-level tasks to have at least two direct subtasks, and make complexity visible in editing, task metadata, portable exports, Markdown, MCP output, and roadmap-generation guidance. Time estimates remain optional heuristics.
- Introduce portable roadmap schema v2: task identity is no longer editable/exposed in generated JSON and exports. Tasks are addressed by their roadmap-order numbers (`1.1`, `1.2`, `2.1`, `1.1.1`) while RoadForge keeps opaque internal IDs only for dependency, claim, realtime, reorder, and persistence integrity.
- Keep version 1 ID-based RoadForge/legacy imports compatible while v2 ignores attempted custom task IDs and resolves positional dependencies/subtasks across phase boundaries.
- Replace user-facing "next task" semantics with non-exclusive task recommendations; multiple tasks may be recommended without RoadForge asserting that one task is the authoritative next action.
- Make Markdown exports use the same order-derived task references and recommendation language instead of exposing opaque internal IDs.
- Let the forge atmosphere show subtly through phase and primary workspace surfaces while keeping controls, menus, and modal overlays dense enough for readability.
- Give embers a restrained slow flicker, occasional hot flare, and soft glow while preserving the 30 fps cap and reduced-motion behavior.

### Hosted demo and self-hosting positioning

- Define `roadforge.anvilary.tools` as the official hosted demo/reference deployment for evaluation, examples, and light collaboration rather than a managed production-team or large-team SaaS.
- Make portable JSON backups the explicit user-controlled safety path for important work on the demo.
- Direct sustained, operational, or larger-team use to a fork/controlled clone on self-hosted infrastructure under the applicable repository license.
- Document operator ownership of persistence, backups/restores, retention, monitoring, capacity/load testing, upgrades, security configuration, and incident response.
- Clarify that the maintained Compose/Redis multi-worker topology is a production-oriented reference, not an arbitrary team-size or concurrency certification.
- Align README, docs map, self-hosting/security/deployment/support docs, help content, and landing-page copy around the same deployment boundary and add copy-contract tests against future drift.

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
