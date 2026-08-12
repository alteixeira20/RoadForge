# Internet-facing security audit — 2026-08-12

Status: consolidated source/repository audit for the `security/internet-hardening` candidate.

Baseline: `ff338f664c3d0e5bd6ea867ab65ed75bdeae0516` (`main` before this hardening work).

The final candidate is the commit containing this report plus no later code changes. The exact
candidate SHA and workflow conclusions are recorded in draft PR #31 and in the maintainer's
final audit report after all exact-head gates complete.

## Scope

This audit treats RoadForge as an Internet-facing, accountless, local-first collaboration
application. It covers:

- roadmap creation/join/authentication and owner/editor/viewer authorization;
- invite, participant-session, password, and SSE event-ticket credential handling;
- cross-roadmap isolation, revocation, expiry, role changes, and realtime behavior;
- browser storage, CSRF/origin handling, CSP, untrusted links/imports, request-size limits,
  caching, and logging;
- PostgreSQL/Redis state and migration safety;
- self-hosted nginx/Compose/container controls;
- MCP credential transport;
- dependency/CI supply-chain controls and release evidence.

It does **not** claim to inspect the live Cloudflare account, Tunnel configuration, host OS,
external observability, retained historical logs, or backup storage. Those require deployed
operator evidence.

## Threat model

### Assets

- private roadmap contents, versions, activity, tags, claims, and collaboration state;
- owner/editor mutation capabilities;
- role invite credentials, participant sessions, optional roadmap passwords, event tickets;
- PostgreSQL durable state and Redis coordination state;
- deployment/CI credentials and release integrity.

### Trust boundaries

1. browser → public HTTPS edge / Cloudflare;
2. edge → maintained nginx → Next.js/FastAPI;
3. FastAPI → PostgreSQL and optional Redis;
4. browser JavaScript → persistent browser storage / HttpOnly cookies;
5. coding agent / MCP process → FastAPI Bearer API;
6. GitHub pull request/dependency/workflow changes → release artifacts.

### Relevant attackers

- anonymous Internet user;
- holder of a leaked invite URL/token;
- malicious, downgraded, expired, or revoked collaborator;
- attacker with XSS/page-script execution, malicious extension, or compromised browser
  profile;
- attacker with access to database/backups/logs;
- compromised/misconfigured proxy/container/dependency/CI action.

## Findings and disposition

| ID | Severity | Finding | Final disposition |
| --- | --- | --- | --- |
| SEC-001 | High | Generated invite bearer credentials were placed in `?token=` query strings. | **Fixed.** New links use `/join#token=...`; join bootstrap scrubs token-bearing location state. Query parsing remains migration-only. |
| SEC-002 | High | SSE event tickets were placed in EventSource `?ticket=` URLs. | **Fixed.** 30-second single-use roadmap/participant-scoped tickets use a path-scoped HttpOnly cookie; EventSource URL contains no credential. |
| SEC-003 | High | Long-lived participant Bearers were persisted in browser localStorage. | **Fixed for the normal browser path.** New create/join sessions exchange to a roadmap-path-scoped HttpOnly cookie before persistent auth state; storage keeps only a non-secret marker. Legacy/degraded Bearers migrate on successful hydration. |
| SEC-004 | Medium/High | Viewer raw invite token was persisted in `share_links.public_token`. | **Fixed.** Viewer invites are reveal-once/hashed like other roles. Migration `0011` deactivates legacy persisted viewer links and drops `public_token`. |
| SEC-005 | Medium | Redis-backed rate limiting failed open on Redis errors. | **Fixed.** Redis limiter failure returns `503` + `Retry-After` rather than unbounded access. |
| SEC-006 | Medium | Sensitive-response `no-store` policy omitted roadmap `PATCH` responses. | **Fixed.** `PATCH` is included in centralized sensitive API cache policy. |
| SEC-007 | Medium | Security-header ownership had inconsistent values across Next.js/FastAPI/nginx. | **Fixed.** Maintained baselines align on `no-referrer`, nosniff, frame denial, and restrictive permissions; CSP remains application-owned. |
| SEC-008 | Medium | Self-hosted Compose lacked compatible runtime confinement. | **Fixed.** Web/API use read-only roots, cap-drop ALL, no-new-privileges, PID limits, and narrow tmpfs writes; data services receive compatible confinement. |
| SEC-009 | Medium | Maintained GitHub Actions used mutable major-version tags. | **Fixed.** Maintained workflow actions are pinned to immutable upstream commit SHAs; normal validation permissions remain read-only. |
| SEC-010 | Medium | MCP parsed only query-token invite URLs, encouraging legacy credential-in-query transport. | **Fixed.** MCP prefers fragment tokens and accepts query tokens only as compatibility fallback, with regression coverage. |
| SEC-R01 | Low | Optional roadmap password creation minimum remains six characters. | **Accepted residual.** Password is an optional second factor behind a high-entropy invite, guessing is rate-limited, and hashes use salted PBKDF2-SHA256. Raising the UX/policy floor should be a deliberate product change. |
| SEC-R02 | Low | Production CSP retains `style-src 'unsafe-inline'` for dynamic React style attributes. | **Accepted residual.** Executable scripts remain nonce-restricted without production script `unsafe-inline`/`unsafe-eval`. |
| SEC-R03 | Medium architecture | MCP/API clients use full participant Bearer sessions rather than narrower machine credentials. | **Deferred architecture hardening.** Browser storage is no longer the reason to weaken this contract; scoped machine credentials remain a separate design project (tracked separately). |
| SEC-R04 | Operational | Repository CI cannot prove live Cloudflare/nginx/host/log/backup configuration. | **Requires deployment proof.** Follow the operational proof gate on the exact deployed candidate. |

No Critical vulnerability was confirmed during the repository audit.

## Authentication and authorization conclusions

The central API authorization design was retained rather than rewritten. Protected routes use
the authoritative participant record and re-check roadmap scope, deletion state,
revocation/expiry, and role. The audit added explicit regression coverage for cross-roadmap
access and immediate role downgrade behavior.

Roles remain exactly `owner`, `editor`, and `viewer`; the audit did not invent unsupported
roles merely to satisfy a generic checklist.

Invite rotation/revocation and participant-session revocation remain intentionally separate:
rotating an invite blocks future joins; revoking a participant invalidates that existing
session. Realtime revocation remains server-authoritative after stream establishment.

## Browser session contract

Normal browser create/join flow:

1. API returns a cryptographically random roadmap-scoped participant Bearer once.
2. Before returning auth state to the rest of the web UI, the client exchanges it at
   `POST /api/roadmaps/{roadmap_id}/session/cookie`.
3. API sets `roadforge_session` with `HttpOnly`, `SameSite=Strict`, production `Secure`, and
   path `/api/roadmaps/{roadmap_id}`.
4. Persistent browser auth contains only `__roadforge_http_only_session__`, which is not a
   credential and is never serialized as `Authorization`.
5. Cookie-authenticated unsafe methods require an exact configured `Origin`.
6. Explicit API/MCP Bearer requests remain separate and do not depend on ambient cookies.

If the one-time cookie exchange itself fails after create/join succeeded, the client retains
the roadmap-scoped Bearer as a degraded recovery credential rather than orphaning access.
Hydration retries the exchange later. This fallback is intentional: successful normal
bootstrap removes persistent JavaScript-readable credentials, while temporary API/version/
cookie failures do not destroy the user's only access path.

Pre-hardening localStorage Bearers follow the same migration rule: only after a successful
exchange is the raw value replaced by the non-secret marker. This preserves local-first
offline recovery.

## Invite and realtime migration

- New owner/editor/viewer links use fragments.
- The browser join page supports old query-token links only to migrate existing links, then
  removes the credential from the current history entry.
- Migration `0011_remove_public_viewer_tokens.py` deactivates legacy viewer records that held
  plaintext `public_token`, clears the material, and drops the column.
- After deployment, rotate the viewer link once when a new copyable viewer invite is needed.
- Rotate any pre-hardening owner/editor query invite that may have been shared or logged.
- SSE ticket bootstrap now sets `roadforge_event_ticket` as a 30-second HttpOnly,
  SameSite-Strict, roadmap-path-scoped cookie. The server consumes the ticket once and expires
  the browser ticket cookie.

## Application/input review

The audit did not find an unresolved SQL/string-built injection path in the reviewed API
flows. Roadmap persistence/auth/share paths use SQLAlchemy and schema/domain validation.

Relevant existing controls retained/verified:

- request-body middleware counts actual streamed bytes, not only `Content-Length`;
- browser/API/nginx share the maintained 5 MiB roadmap payload ceiling;
- task external links are normalized and credential-like query parameters are rejected;
- outbound task links use safe new-window rel attributes;
- no maintained `dangerouslySetInnerHTML`, `eval`, or `new Function` use surfaced in the
  security sweep;
- passwords are salted PBKDF2-SHA256 hashes with timing-safe comparison;
- API/nginx application logging omits query strings, Authorization/cookies, bodies, and
  Referer values;
- production API docs/OpenAPI are disabled;
- trusted forwarded client IPs require an explicitly trusted immediate proxy;
- multi-worker realtime requires Redis and does not silently fall back to memory.

## CSP and response policy

Production frontend scripts use per-response nonce CSP with `strict-dynamic`; script
`unsafe-inline` and script `unsafe-eval` are absent in production. Nonce-bearing HTML is
private/no-store. `style-src 'unsafe-inline'` is the explicit low-severity compatibility
boundary described above.

Sensitive roadmap API responses include `Cache-Control: no-store`, including `PATCH`.
Browser-session exchange and event-ticket bootstrap are also non-cacheable under the
centralized roadmap response policy.

## Infrastructure conclusions

Both production application images already ran as non-root before this audit. The source
finding claiming the API image ran as root was stale and was not treated as a vulnerability.

The maintained Compose topology now confines application containers without breaking known
runtime write requirements. PostgreSQL/Redis stay on the internal network and retain the
writable runtime paths they require. Arbitrary CPU/memory ceilings were deliberately not
invented as a security control because unsafe limits can create avoidable production outages;
PID/process and privilege/filesystem confinement are explicit.

The maintained nginx log format remains credential-safe (`$uri`, not `$request_uri`) and
omits Referer. External Cloudflare/Tunnel/host logging must still be inspected separately.

## Supply-chain conclusions

Maintained workflows use immutable action SHAs for checkout, setup-node, setup-python,
pnpm setup, and artifact upload. Standard validation permissions are `contents: read`.

Release validation retains JavaScript and locked-Python runtime audits, lock-drift checking,
migration/schema drift, API tests, real Redis tests, MCP checks, container builds, Compose
validation, and production browser/CSP coverage.

The existing exact-advisory `nanoid` dependency exception remains governed by the separate
short-lived dependency policy/tracking issue. This audit does not convert that exception into
a permanent suppression.

## Required post-deploy actions

1. Create and verify a PostgreSQL backup before applying the migration.
2. Deploy the exact reviewed candidate and run `alembic upgrade head`.
3. Rotate the viewer link once to obtain a new reveal-once viewer URL.
4. Rotate pre-hardening owner/editor query links that may have been distributed or logged.
5. Reopen/refresh representative old browser sessions and confirm localStorage migrates from
   raw Bearer to the non-secret marker after successful hydration.
6. Verify new invite URLs use `#token=` and EventSource URLs contain no credentials.
7. Exercise owner/editor/viewer, cross-role writes, realtime, conflict handling, participant
   revocation, and invite rotation.
8. Inspect actual Cloudflare/nginx/host/observability logs for credential leakage using
   sanitized evidence only.
9. Verify CSP/HSTS/CORS/Origin behavior at the public edge and complete a backup/restore and
   rollback-readiness check.

The detailed operator checklist is [Operational Proof Gate](./operational-proof-gate.md).

## Release decision rule

Repository-ready requires every maintained relevant workflow green on the same exact final
head. Public-deployment-ready additionally requires the deployed operator proof above.

Any unresolved Critical/High finding, authz bypass, leaked active credential, unsafe
migration, or failed exact-head security gate blocks release. The residual findings listed in
this report are non-blocking only if they remain explicitly accepted/deferred as documented.
