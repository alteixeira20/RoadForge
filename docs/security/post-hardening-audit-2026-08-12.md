# Post-hardening Internet-facing security audit — 2026-08-12

Status: exact-head validation candidate

This audit re-reviewed RoadForge after the earlier Internet-facing hardening work had already landed on `main`. It covers authentication/session/invite transport, authorization boundaries, SSE/realtime behavior, CORS/Origin/CSP, request limits, logging, persistence/retention, dependency/supply-chain gates, and the self-hosted deployment contract.

The audit did not identify a confirmed Critical vulnerability. It did identify five additional repository-level availability/lifecycle weaknesses that matter for an Internet-facing accountless application.

## Findings and remediations

### SEC-011 — Medium — production frontend origins could use plaintext HTTP

**Finding:** production startup rejected wildcard or malformed CORS entries but still accepted an explicit `http://` origin. `ROADFORGE_WEB_BASE_URL` also lacked an HTTPS/canonical-origin requirement. Because generated invite links carry reveal-once bearer credentials in the fragment, a production operator could accidentally configure credential delivery through a plaintext frontend origin.

**Remediation:** production startup now requires every CORS origin to be an explicit HTTPS origin without userinfo/path/query/fragment. `ROADFORGE_WEB_BASE_URL` must itself be an HTTPS origin and must appear in the configured CORS allowlist. Invite URL construction also normalizes a trailing slash.

### SEC-012 — Medium — unbounded realtime streams and slow-consumer queues

**Finding:** an authenticated participant could repeatedly mint short-lived event tickets and open long-lived SSE streams. Redis mode allocates one pub/sub subscription per stream, while memory mode previously allocated an unbounded `asyncio.Queue` for every subscriber. A slow or abusive credential holder could therefore multiply connection/state cost or accumulate queued events.

**Remediation:** active realtime streams are capped per participant. Memory mode uses an in-process lease registry; Redis mode uses shared TTL-backed leases so multi-worker deployments enforce one global participant limit. Lease acquisition fails closed when Redis cannot enforce the bound. Memory subscriber queues are bounded; a slow consumer that overflows its queue is disconnected instead of accumulating unbounded memory. Stream leases are refreshed during periodic authorization checks and released on close.

### SEC-013 — Medium — one invite could create unbounded active participant sessions

**Finding:** join attempts were rate-limited, but every successful join created a new participant/session row with no concurrent active-session ceiling. A valid leaked or intentionally shared invite could therefore produce continuing participant-row and activity-log growth over time.

**Remediation:** each share link now has a configurable active-session ceiling. Concurrent joins are serialized by locking the share-link row, the locked row is force-refreshed from PostgreSQL to close a token-rotation race, and only non-revoked/non-expired sessions count toward the limit. Excess joins receive `429`.

### SEC-014 — Medium — server storage growth lacked hard resource ceilings

**Finding:** anonymous roadmap creation had an IP velocity limit, but active roadmaps are intentionally retained indefinitely. Soft-deleted roadmaps are only hard-purged later. Activity and version history had age/count policies but no overall server roadmap capacity, activity-row ceiling, or restore-history byte ceiling. An Internet-facing demo could therefore experience storage amplification despite per-request body/rate limits.

**Remediation:** RoadForge now has configurable hard resource ceilings:

- total server roadmap records (soft-deleted rows continue to count until hard purge);
- activity rows per roadmap;
- restore-history bytes per roadmap in addition to the existing 100-version count ceiling;
- active sessions per share link;
- concurrent realtime streams per participant.

Roadmap creation takes a PostgreSQL advisory transaction lock before checking capacity, preventing concurrent anonymous creates from overshooting the configured global record ceiling. Restore-history trimming always preserves the newest three versions before applying the byte ceiling.

### SEC-015 — Low/Medium — existing SSE authorization outlived roadmap deletion/session expiry

**Finding:** the SSE authorization helper treated a missing/revoked participant as unauthorized but did not include roadmap soft deletion or participant expiry. Normal API requests already rejected deleted roadmaps and expired sessions, so an already-open event stream had a wider lifecycle boundary than REST access.

**Remediation:** SSE authorization now treats missing/revoked/expired participants and soft-deleted roadmaps as unauthorized. `roadmap.deleted` is a terminal in-band event: existing subscribers receive that final explanation and the stream closes.

## Regression coverage

The candidate adds focused tests for:

- HTTPS-only production origin and invite-base configuration;
- concurrent realtime stream leases;
- bounded slow-consumer queues;
- terminal roadmap-deletion SSE behavior;
- global server roadmap capacity;
- per-invite active-session capacity;
- per-roadmap activity-log trimming;
- restore-history byte trimming;
- soft-deleted roadmap invalidation of SSE authorization.

These tests supplement the existing cross-roadmap authorization, CSRF/browser-cookie, invite transport, revocation, CSP/browser, Redis, dependency-audit, migration-drift, container and deployment gates.

## Security controls re-reviewed with no new confirmed repository-level finding

The re-audit also rechecked the previously hardened boundaries:

- participant bearer credentials and invite tokens remain hashed at rest;
- generated invite links use fragment credentials and browser query-token support remains migration-only;
- browser sessions use roadmap-scoped HttpOnly cookies with exact-Origin checks for unsafe cookie-authenticated methods;
- SSE bootstrap uses a 30-second single-use HttpOnly ticket cookie rather than URL credentials;
- roadmap authorization remains roadmap-scoped and checks revocation, expiry, deletion and role;
- request-body size enforcement counts streamed bytes rather than trusting `Content-Length`;
- Redis-backed public rate limiting fails closed;
- production scripts remain nonce-restricted by CSP; `style-src 'unsafe-inline'` remains an explicit compatibility residual;
- application/nginx access logging avoids query strings and credential headers;
- maintained GitHub Actions remain pinned to immutable SHAs and validation permissions remain read-only;
- self-hosted application containers retain read-only roots, capability drops, no-new-privileges and PID ceilings.

## Residual risks / explicit boundaries

The following are not treated as release-blocking vulnerabilities in this audit:

- optional roadmap passwords still permit a six-character minimum; invite tokens remain high-entropy bearer credentials and password verification is rate-limited and salted/hashed;
- production CSP still permits inline styles for current React styling compatibility, while scripts remain nonce-restricted;
- MCP/API clients still use full participant bearer sessions; narrower scoped MCP credentials remain a post-0.1 architecture improvement;
- repository review cannot prove the live Cloudflare/Tunnel/nginx/host/logging/backup configuration. Public release still requires the operational proof gate on the deployed candidate;
- the GitHub integration used for this audit could not read code-scanning/secret-scanning alerts, and the Dependabot vulnerability-alert endpoint reports that alerts are disabled. Repository CI dependency audits remain the source-controlled release gate, but operators should enable/verify GitHub-native security alerting separately where available.

## Merge gate

Do not merge this candidate based on source review alone. The exact final head must pass:

- full CI;
- API Locked Validation;
- Web CSP Validation;
- Documentation Contract;
- Release Contract.

Deployment still requires the checks in `docs/security/operational-proof-gate.md`.
