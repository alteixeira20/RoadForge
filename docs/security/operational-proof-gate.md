# Operational Proof Gate

See also: [Security documentation index](./README.md) |
[Release checklist](../../.github/RELEASE_CHECKLIST.md) |
[Self-hosting](../self-hosting.md)

Code and policy documents cannot prove operational safety. This document is the
procedure that produces that proof for a release candidate, and it records which
parts a local machine can already settle.

Every step below states its prerequisites, exact command, expected output, and
pass/fail criterion. Record the result beside the release ticket with the
candidate revision and the operator name.

## Evidence classes

| Class | Meaning |
|---|---|
| **Automated** | A repository command decides it. No judgement required. |
| **Local manual** | A person runs it on a developer machine against disposable data. |
| **Deployed manual** | Requires a running candidate deployment. Cannot be inferred locally. |
| **Decision** | A person accepts or rejects a risk; no command can settle it. |

---

## 1. Automated — settled by repository commands

Run from the repository root on the candidate revision.

```bash
make release-check
corepack pnpm --dir apps/web test:browser
corepack pnpm --dir apps/web benchmark:roadmap
make audit
make api-audit
```

**Expected:** every command exits zero. `make audit` prints
`No known vulnerabilities found`. `make api-audit` prints
`No known vulnerabilities found`.

**Pass/fail:** any non-zero exit blocks the release. A new high-severity
advisory blocks the release until upgraded or formally suppressed under the
[dependency audit policy](./dependency-audit-policy.md).

The following are covered by that automated run and need no separate manual
check. Do not re-verify them by hand:

| Property | Where it is proven |
|---|---|
| Minimal health response with security headers | `tests/test_security_hardening.py` |
| Access logs exclude query-string credentials | `tests/test_security_hardening.py` |
| OpenAPI docs disabled outside development | `tests/test_security_hardening.py` |
| Production rejects a default secret key | `tests/test_security_hardening.py` |
| Production rejects a default database URL | `tests/test_security_hardening.py` |
| Memory realtime refuses multiple workers | `tests/test_security_hardening.py` |
| Redis realtime requires a URL and pings on startup | `tests/test_security_hardening.py` |
| Forwarded client IP trusted only from configured proxies | `tests/test_security_hardening.py` |
| Wildcard trusted-proxy networks rejected | `tests/test_security_hardening.py` |
| Request body size limits | `tests/test_body_limit.py` |
| Rate limits per action and identity | `tests/test_rate_limits.py` |
| Role enforcement, share links, session expiry | `tests/test_auth_and_share_links.py` |
| Exports exclude sessions, tokens, and server-only state | web parser and export suites |
| Report links carry no roadmap or session state | `ProblemReportLink` suite |
| Frontend CSP composition | `src/lib/__tests__/content-security-policy.test.ts` |
| ORM/migration drift | `make api-check` |

### Secret and artifact scan

```bash
git ls-files | grep -Ei '\.env($|\.)|\.pem$|\.key$|id_rsa|credentials'
git ls-files | grep -E '(^|/)(\.next|node_modules|playwright-report|test-results|__pycache__|\.venv|dist|build|coverage)(/|$)'
grep -rn 'NEXT_PUBLIC_' apps/web/src apps/web/next.config.ts deploy
```

**Expected:** the first prints only `.env.example` and
`deploy/self-hosted/.env.example`; the second prints nothing; the third shows
only `NEXT_PUBLIC_API_URL`.

**Pass/fail:** any real credential file, tracked build output, or secret-bearing
`NEXT_PUBLIC_*` variable blocks the release. Everything under `NEXT_PUBLIC_` is
compiled into client bundles and is public by definition.

---

## 2. Local manual — disposable data on a developer machine

### 2.1 Backup and restore drill

**Prerequisites:** Docker running, `make api-up` completed, a migrated local
database.

Follow [backups and updates](../self-hosting.md#backups-and-updates) to write the
dump, then the [disposable restore drill](../self-hosting.md#disposable-restore-drill)
to restore it. On a developer machine substitute the local compose service
(`docker compose exec -T postgres`) and a scratch backup directory.

**Expected:** the dump is non-empty, `pg_restore --list` reads its catalog, the
checksum verifies, the drill database is created and restored with
`--exit-on-error`, and the verification query returns the same roadmap,
participant, version, and activity counts as the source.

**Pass/fail:** any failed step means the documented procedure is wrong and the
release is blocked. An untested backup is not a recovery plan.

**Afterwards:** drop the drill database and delete the local dump. Never restore
into `roadforge` itself, and never point this drill at production.

### 2.2 Deployable artifact boot

```bash
corepack pnpm --dir apps/web benchmark:roadmap:browser
```

**Expected:** passes. The browser stage builds and serves the same
`output: 'standalone'` artifact the Dockerfile ships, so a pass also proves the
deployable server boots and serves the workspace.

---

## 3. Deployed manual — requires a running candidate

These cannot be settled locally at any effort. Each needs the candidate
deployed behind its real reverse proxy and TLS.

| # | Check | Expected | Pass/fail |
|---|---|---|---|
| 3.1 | `curl -sS https://<host>/api/health` | `{"status":"ok",...}` plus `x-content-type-options`, `x-frame-options`, `referrer-policy`, `permissions-policy` | Missing header or non-200 blocks release. Liveness alone does not prove dependency health — confirm PostgreSQL and the realtime backend separately |
| 3.2 | Preflight from an allowed and a disallowed origin | Allowed origin echoed in `access-control-allow-origin`; disallowed origin rejected with no such header | A wildcard origin alongside `access-control-allow-credentials` blocks release |
| 3.3 | HTTPS and HSTS at the edge | Redirect to HTTPS; `strict-transport-security` present | Plain HTTP serving the app blocks release |
| 3.4 | Trusted proxy handling | Client IPs in logs are real client addresses, not the proxy | Rate limiting keyed on the proxy address blocks release |
| 3.5 | Credential-safe log review, per [proxy and application log review](../../deploy/self-hosted/README.md#credential-safe-log-review) | No session token, invite token, or roadmap password in proxy or application logs | Any credential in logs blocks release. Record the reviewed time range only — never paste matching lines into the ticket |
| 3.6 | Share-link and session revocation | Revoked invite cannot join; revoked participant loses access on next request | Continued access after revocation blocks release |
| 3.7 | Rate limiting under the real proxy | Documented limits return the documented error shape | Limits not applying at the edge blocks release |
| 3.8 | Pre-migration backup taken, then `alembic upgrade head` and `alembic check` | Upgrade applies; drift check reports no new operations | Missing backup blocks the migration outright |
| 3.9 | Projection backfill and parity, per [self-hosting](../self-hosting.md) | Parity verified; `roadmaps.snapshot_json` remains canonical | Parity drift is a decision, not an automatic pass |
| 3.10 | Worker and realtime mode | `ROADFORGE_API_WORKERS=1` for memory mode, or `ROADFORGE_REALTIME_BACKEND=redis` with reachable Redis for more, per [RF-886 checklist](../manual-qa.md#30b--rf-886-multi-worker-realtime-regression-checklist) | Multiple workers in memory mode blocks release |
| 3.11 | Two-session collaboration over the deployment | Owner and editor changes propagate; viewer stays read-only | Lost or misattributed updates block release |
| 3.12 | Rollback rehearsal | Previous revision redeploys and serves | An unrehearsed rollback blocks release. Application rollback does not reverse migrations; restore PostgreSQL when the schema moved |

---

## 4. Decisions — recorded, not computed

- Accept or reject each non-blocking defect, with an owner and a disposition.
- Accept the [known acceptable limitations](../manual-qa.md#known-acceptable-limitations)
  as release-note content.
- Name the rollback operator and the rollback revision before deploying.
- Approve the staging candidate before production.

---

## Evidence to retain

For each release, keep beside the ticket:

- candidate revision and operator name;
- command output or exit status for section 1;
- backup filename, checksum, and drill verification counts for section 2.1;
- observed values for each section 3 row, with credentials redacted;
- every decision from section 4 with its owner.

Retain nothing that contains a session token, invite token, roadmap password, or
customer roadmap content.
