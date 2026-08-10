# Security documentation

See also [SECURITY.md](../../SECURITY.md) for responsible vulnerability disclosure.

RoadForge is accountless and local-first. Security work focuses on protecting roadmap-scoped
bearer credentials, validating untrusted roadmap content, limiting public-endpoint abuse,
controlling browser attack surface, preserving data integrity, and keeping production
dependencies/recovery operations auditable.

Current implementation is authoritative over historical design notes.

## Session and authorization

[Session Expiry and Revocation Policy](./session-expiry-and-revocation-policy.md)

documents participant sessions, sliding expiry, owner revocation, invite-link vs participant
revocation, and preservation of local work when server access changes.

[Access Model](../access-model.md) is the higher-level owner/editor/viewer product contract.

## Rate limiting and realtime coordination

[Rate Limiting Policy](./rate-limiting-policy.md) covers create/join/password/authenticated
operation limits and their key dimensions. Memory mode is process-local; Redis-backed mode
shares rate-limit and realtime coordination state across workers/instances.

## Browser headers and CSP

[Security Headers Policy](./security-headers-policy.md) records current browser/proxy header
behavior and the Content Security Policy boundary. The `0.1.0` release baseline keeps CSP
report-only until the tracked nonce-based enforcement design is implemented and validated.

## Public deployments

[Public Deployment Security](../public-deployment-security.md) documents production mode,
CORS, trusted proxies, credential-safe logging, health/readiness semantics, payload limits,
Redis topology, migrations, and public-network expectations.

## Server data retention

[Server Data Retention and Purge](../server-data-retention.md) defines the distinction between
browser deletion, server soft deletion, and final hard purge. It documents the dry-run-first
operator command, minimum ages, bounded batches, restore-point preservation, backup/recovery
requirements, scheduling, monitoring, and safe public deletion wording.

Final hard purge is an operator action; user-facing delete remains soft deletion until the
retention threshold is reached.

## Release proof

[Operational Proof Gate](./operational-proof-gate.md) separates repository-automated evidence
from deployed/manual checks and documents release verification expectations.

[Manual QA](../manual-qa.md) owns the current end-to-end release checklist.

## Dependency reproducibility and audits

[Dependency Audit Policy](./dependency-audit-policy.md) documents JavaScript/Python audit
thresholds and exception rules. The dedicated Python lock work is tracked in issue #7 until
its branch lands; JavaScript uses the committed pnpm lock.

## Review rule

Security-sensitive changes should include negative/failure-path tests, not only successful
owner paths. Never put invite/session tokens, passwords, private roadmap exports, database
credentials, Redis credentials, or unredacted private logs in public issues or release
evidence.
