# Operational Proof Gate

See also: [Security documentation index](./README.md),
[Release checklist](../../.github/RELEASE_CHECKLIST.md), and
[Self-hosting](../self-hosting.md).

Repository CI proves source-level invariants. It cannot prove that a particular Cloudflare,
nginx, TLS, backup, or host deployment preserves those invariants. A public release therefore
needs both exact-candidate automated evidence and deployed operator evidence.

Record the candidate revision, date, and operator beside the release record. Never retain
credentials or private roadmap contents as proof artifacts.

## 1. Exact-candidate automated gate

The normal PR/release evidence must be green on one exact candidate head:

- **CI** — `make check`, MCP package checks, API lint/syntax/tests, migration drift, real-Redis
  revocation tests, dependency audits, production container builds, Compose validation, web
  unit tests, development browser tests, and production browser smoke;
- **API Locked Validation** — lock drift/export, locked runtime audit, migration drift, full API
  tests, and real-Redis revocation tests;
- **Web CSP Validation** — lint, typecheck, unit tests, Compose validation, and enforced
  production nonce-CSP/browser tests;
- **Documentation Contract** — local links, product copy, issue forms, and patch whitespace;
- **Release Contract** — version/toolchain/release invariants.

A green run from an older commit is not evidence for a newer candidate.

### Security properties covered by repository tests

The exact source/tests should prove at least:

- every protected API path revalidates roadmap scope, role, expiry, and revocation;
- cross-roadmap participant credentials cannot read/write/share/bootstrap realtime for another
  roadmap;
- role downgrades/revocation take effect on subsequent requests;
- generated invites use fragment credentials and ordinary share-link listing cannot recover
  raw invite tokens;
- migration `0011` removes plaintext viewer invite storage;
- browser sessions exchange to path-scoped HttpOnly cookies and cookie-authenticated unsafe
  requests require an allowed Origin;
- explicit API/MCP Bearer requests remain separate from ambient cookie authentication;
- EventSource URLs contain no ticket/session credential and tickets remain short-lived,
  roadmap/participant-scoped, and single-use;
- sensitive roadmap responses, including `PATCH`, are non-cacheable;
- request-body limits count streamed bytes;
- Redis-backed rate-limit checks fail closed;
- production API docs are disabled;
- forwarded client addresses are trusted only from configured proxies;
- multi-worker memory realtime is rejected;
- production web scripts use nonce CSP without script `unsafe-inline`/`unsafe-eval`;
- production images run non-root and the maintained Compose file validates;
- maintained GitHub Actions are immutable-pinned and normal validation permissions are
  read-only;
- dependency audits satisfy the documented release policy.

### Repository secret/artifact check

Before a public release, review tracked files and CI output for credentials and generated
artifacts. At minimum verify that no real `.env`, private key, credential file, database dump,
browser report, build output, or token-bearing diagnostic was committed.

Everything under `NEXT_PUBLIC_*` is browser-visible by definition. The maintained public
browser configuration should contain only non-secret values such as the API origin.

## 2. Local operator proof

### Backup/restore drill

Before a schema-sensitive deployment, produce a PostgreSQL backup outside the repository and
database volume, verify it is non-empty and readable by `pg_restore --list`, record a
checksum, and periodically restore it into a disposable database with `--exit-on-error`.
Compare representative roadmap/participant/version/activity counts with the source.

An untested backup is not a recovery plan. Never run the drill against the production
database name.

### Deployable artifact boot

Run the maintained production browser/build path rather than only a development server. The
CI production container/browser jobs are the normal automated evidence; a local operator may
repeat them before a sensitive deployment.

## 3. Deployed manual gate

These checks require the exact candidate behind the real reverse proxy/TLS stack. Repository
CI cannot substitute for them.

| Check | Expected | Blocker if |
| --- | --- | --- |
| Readiness | `/api/health` and `/api/health/ready` report configured dependencies ready | required dependency is unavailable |
| HTTPS/HSTS | public app is HTTPS and stable edge emits HSTS | app is served over plaintext or HSTS is absent at intended edge |
| CORS | allowed Origin works; disallowed Origin is not granted CORS access | wildcard/incorrect credentialed CORS is exposed |
| Cookie write Origin | normal browser owner/editor writes succeed; disallowed/missing Origin cookie write is rejected | ambient-cookie write bypasses Origin policy |
| Browser session storage | after create/join/migration, localStorage contains only the non-secret browser-session marker | raw participant Bearer remains after successful exchange |
| Invite transport | newly rotated owner/editor/viewer links use `#token=` | new product link emits `?token=` |
| Legacy invite cleanup | migrated viewer link is inactive; old distributed owner/editor query links are rotated as needed | known leaked/pre-hardening credential remains intentionally active |
| Realtime | EventSource request URL contains no `ticket`/session query credential; owner/editor changes propagate and viewer is read-only | secret appears in URL or authz/realtime behavior is wrong |
| Revocation | revoked invite cannot create future joins; revoked participant loses protected access immediately | revoked credential/session still authorizes |
| Rate limiting | documented public limits produce `429`; Redis limiter outage in Redis mode produces `503` rather than unbounded access | limiter is bypassed or keyed on one proxy address unexpectedly |
| Trusted proxy | effective client IP is the real client only through the configured trusted chain | arbitrary forwarding headers are trusted or all clients collapse to proxy IP |
| CSP | one compatible enforced application CSP is present; nonce scripts work; unexpected injected script is blocked | conflicting edge CSP or executable production `unsafe-inline`/`unsafe-eval` is introduced |
| Logging | maintained application/proxy logs and external edge logs contain no invite/session/ticket/password credential | any credential is retained/logged |
| Container confinement | web/API still boot under non-root/read-only/cap-drop/no-new-privileges configuration | workaround requires broad privilege/filesystem relaxation without review |
| Migration | verified backup exists, `alembic upgrade head` succeeds, schema drift check is clean | migration is unbacked or drift remains |
| Rollback | previous known-good application revision and database recovery procedure are identified/rehearsed | rollback depends on an untested destructive step |

For the internet-hardening migration specifically, rotate the viewer link once after migration
when a fresh copyable viewer link is required. Rotate pre-hardening owner/editor query links
that may have been distributed or logged.

## 4. Evidence handling

Retain only sanitized evidence:

- exact candidate SHA and workflow conclusions;
- operator/date/environment;
- backup filename/checksum and restore result, not database contents;
- pass/fail notes for deployed checks;
- aggregate credential-log scan counts, not matching credential-bearing lines;
- explicit residual-risk decisions and rollback revision.

Do **not** retain raw invite links, participant sessions, event tickets, passwords,
Authorization/cookie values, private exports, or unredacted browser/network logs in GitHub
issues, PR comments, screenshots, or release evidence.

## 5. Release decision

A source candidate is repository-ready only when every maintained exact-head gate is green.
A public deployment is security-ready only after the deployed-manual gate is also completed
on that same candidate/environment.

Known non-blocking limitations must be listed explicitly with an owner/disposition. A Critical
or High unresolved security issue, credential leak, authorization bypass, unsafe migration,
or failed exact-head security gate blocks release.
