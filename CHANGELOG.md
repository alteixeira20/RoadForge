# Changelog

All notable RoadForge changes are recorded here. Versions follow Semantic Versioning.
Dates use ISO format.

## Unreleased

Changes after the `0.1.0` baseline belong here.

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

### Known boundaries

- Browser-local data can be removed with site storage; important roadmaps should be exported as JSON.
- `roadforge.anvilary.tools` is a demo/convenience deployment, not a managed backup service.
- Content Security Policy remains report-only pending nonce-based enforcement.
- Final server retention/purge automation is not yet implemented.
- Python dependency resolution is audited but still needs a committed generated lock.
- The MCP package remains experimental and currently reuses roadmap participant credentials.
- The repository is currently PolyForm Noncommercial source-available software; that license is not OSI-approved open source.
