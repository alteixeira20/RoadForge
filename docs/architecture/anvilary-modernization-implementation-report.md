# RoadForge modernization implementation report

## Revisions

| Checkpoint | Revision |
|---|---|
| Starting `main` and local `origin/main` | `d1ed0af4d065428e712e64394cdf9347cbc4f557` |
| Baseline after independent preflight corrections | `f58c36f` |
| Ending implementation and validation revision | `9e5aab03ac2c2ea8fbeebba7ae3a2753ad56bd48` |

The report is recorded in a follow-up documentation commit. The readiness audit's
historical branch and PR dispositions supplied the reconciliation baseline.

## Preflight

- The retained Playwright failure artifact identified the **Password management**
  scenario at its initial **Enable sharing** step. The owner remained on the local
  roadmap while `waitForURL(/\/workspace\?roadmap=rm_/)` timed out at 15 seconds.
  The artifact showed an owner setup failure before the password and join assertions.
  Its original API-side cause is unknown. On the audited revision with the API on
  port 7878 and both the invite origin and CORS set to port 4173, the scenario and
  the other ten multi-client scenarios passed in 45.4 seconds. The full development
  browser suite passed 54 tests in 1.6 minutes, and the production suite passed 30
  tests in 48.8 seconds.
- The MCP package's single `fetchJson` request boundary omitted a redirect policy
  while sending the invite token and optional password in the join body. The first
  correction rejected redirects before reading their responses. Loopback HTTP,
  remote HTTPS, and private HTTP with explicit opt-in remain supported. Two local
  HTTP servers verified that the redirect destination received zero requests from
  the join and bearer test calls.
- The starting revision matched the audit. Validation used Node v24.22.0, Corepack
  pnpm 9.15.9, Python 3.12.13, uv 0.10.0, Docker Engine 29.8.2 and Compose 5.6.0,
  PostgreSQL 16.13, Redis 7.4.8, and Playwright Chromium. The tracked `UV_VERSION`
  controls the pin. The plan's 0.11.13 annotation matched the host installation.
  Frozen dependency installation and the offline Python runtime export passed.
- Browser env variables applied to backend tests caused three failures involving
  allowed origins and the default creation budget. Clearing those overrides
  yielded 451 passing backend tests with four optional Redis cases skipped. The
  dedicated Redis revocation suite passed all 40. The frontend unit suite passed
  769 tests with its default test API URL and reported eight URL mismatches when
  given the separate browser test configuration.
- The current JavaScript audit reported six advisories before the move. Next and
  its ESLint configuration were patched to 15.5.28. The `sharp` and `source-map-js`
  overrides were raised to fixed versions. The production audit then reported
  zero known vulnerabilities. [Next.js critical advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw)
  [sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)
  [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
- The preflight hero viewport check exposed obsolete copy expectations and a
  1440×900 layout with metadata below the fold. The corrected test retained all
  geometry assertions and used the installed Playwright Chromium and standalone
  server. It confirmed metadata insets of 35.0, 35.0, and 27.4 pixels at the three
  desktop sizes. ESLint now excludes generated Playwright reports and results.
- Both proposed feature graphs were checked against current imports. Shared wire
  response mapping and backend snapshot DTO ownership resolved the concrete reverse
  dependencies detailed below.

## Local commits

| Revision | Change |
|---|---|
| `07a8eb6` | Reject MCP API redirects and unsafe URLs |
| `a44e6a2` | Apply frontend dependency security patches |
| `f58c36f` | Correct desktop hero geometry and its viewport harness |
| `4d60704` | Relocate the frontend application and its build paths |
| `66b45de` | Relocate the backend application and its build paths |
| `fbad69e` | Organize frontend features, shared modules, and dependency enforcement |
| `19408ac` | Relocate backend domain routers, services, and schemas |
| `8f757dd` | Enforce backend feature ownership and centralize request policy |
| `647eae7` | Correct hydration's HTTP authorization error classification |
| `3ff7b20` | Centralize patches to existing browser caches |
| `3ce74c6` | Consolidate full-projection mutation commits |
| `b2dca2d` | Consolidate task-projection mutation commits |
| `40f0898` | Consolidate metadata mutation commits |
| `b187993` | Add date formatting and cross-stack contract checks |
| `75534a9` | Release SSE, Redis, and database resources |
| `9e5aab0` | Organize validation, document ownership, characterize concurrent reorder |

## Final architecture

- `apps/frontend/src/app` retains Next.js route ownership. Its 11 features are
  tags, roadmaps, sharing, collaboration, history, tasks, phases, data transfer,
  synchronization, marketing, and workspace. Dependencies point down the feature
  hierarchy. Shared context slices, HTTP and response mapping, storage, UI, reorder,
  types, and leaf domain helpers live under `src/shared`. Synchronization owns
  state writes and hydration, save, and SSE lifecycles. Global CSS ordering is
  preserved.
- `apps/backend/src/api` owns 10 features covering roadmaps, tags, tasks, phases,
  history, sharing, collaboration, realtime, retention, and agent-client endpoints.
  The route aggregator preserves registration order. The shared layer owns auth,
  rate limits, realtime, health, and IDs. Alembic and the centralized ORM remain
  backend-owned. Route handlers authorize explicitly. Services own transactions.
- The focused mutation helper covers standard full, task-only, and metadata
  writes. It applies a single revision, activity write, mode-specific projection,
  activity cap, commit, refresh, and post-commit event. Version writes, revocation,
  delete, join, auth touches, retention, and backfill keep their transaction
  protocols. The claim revision still uses the claim timestamp.
- Tests stay with their apps. The Node checker verifies frontend import cycles
  and feature edges. The backend AST suite checks layers, cycles, and transport
  ownership. The contract checks cover 19 mirrored constants, the browser/API/nginx
  body ceiling, and all 18 MCP operations and their typed payloads.

## Deviations confirmed during implementation

- MCP hardening moved ahead of directory changes as required. Patched dependencies,
  the viewport correction, and Playwright output hygiene were added after
  executed preflight exposed them. Structural checkpoints group related modules
  where ownership changes had to land together.
- The frontend roadmap wire DTO and its pure mapper live in `shared/http`.
  Tag, task, and history services all consume that same response shape. Putting it
  in the roadmaps feature would create a reverse dependency from tags.
- On the backend, canonical phase, task, and tag DTOs live with the roadmap
  snapshot. The shared auth layer owns the share-link DTO. Middleware imports
  the body limit from shared security. Request DTOs stay with their domain.
  These placements follow actual consumers and preserve the approved graph.
- The mutation helper leaves response construction with the caller. This preserves
  the boolean password result and caller-specific no-op behavior.
- The composition root closes the resource owners. The SSE response binds
  cleanup to ASGI delivery, including a disconnect before iteration. Tests also
  cover a failed database close, subscription close, and partial Redis subscribe.
- The two-writer reorder test records each transaction's activity order and the
  final snapshot. A post-commit refresh can observe a later committed snapshot,
  so the activity rows establish the first writer's actual committed order.
- The test taxonomy exercises the pinned gates by runtime. The frontend
  and backend migrations were validated at separate checkpoints, with the full
  cross-runtime matrix run after implementation.

## Executed final validation

| Command | Executed result |
|---|---|
| `make check` | Exit 0 in 31.48 seconds. Product copy, release manifest, architecture, contract limits, docs, issue forms, ESLint, TypeScript, and Next build passed. The import checker evaluated 284 files and 766 internal imports. |
| `make api-lock`, `make api-lint` | Exit 0 in 1.36 and 0.42 seconds. Python lock and deterministic offline export matched. Ruff passed. |
| `make test-unit` | Exit 0 in 41.83 seconds. 779 frontend tests in 105 files, one standalone hero viewport test, 16 MCP tests, and 43 backend unit tests passed. |
| `make test-integration` | Exit 0 in 52.10 seconds. All 428 integration tests passed in 39.44 seconds with optional Redis coverage enabled. Alembic reported zero drift. |
| `make test-runtime` | Exit 0 in 60.88 seconds. 40 revocation tests passed against a disposable Redis, all three PostgreSQL concurrency tests passed, and the production Playwright suite passed all 30 tests in 52.9 seconds. |
| `make test-security` | Exit 0 in 47.01 seconds. JavaScript and Python reported zero known runtime vulnerabilities. 87 backend security tests, 16 MCP tests plus syntax and pack dry run, and two production CSP tests passed. |
| `make test-performance` | Exit 0 in 29.43 seconds. Three CPU benchmarks and one production browser benchmark passed their budgets. The CPU hydration median was 8.29 ms. Browser hydration, typing, search, and expansion measured 457.44, 41.91, 913.66, and 223.69 ms respectively. |
| `make test-e2e` | Exit 0 in 97.23 seconds. All 54 development browser tests passed with four workers and zero retries against FastAPI, PostgreSQL, and Redis. |
| `docker build` and `make deploy-check` | Both images built. Expected non-root users and Compose configuration verified. |
| `git diff --check` and the repository documentation checks | Passed. |

The frontend structure checkpoint passed 769 existing unit tests and three new
refresh-request tests. The backend ownership checkpoint passed 453 tests with
four optional Redis cases skipped, followed by all 40 Redis revocation tests.
The focused hydration and cache suites passed 8 and 112 tests respectively.
The full-projection, task-projection, and metadata checkpoints passed 35, 78,
and 92 focused tests. Lifecycle validation passed 14 unit tests and 52 real-Redis
revocation and capacity tests.

The first post-relocation browser run passed 53 of 54 tests under concurrent
build and integration load. Its phase creation scenario hit the 30-second
test timeout and passed on an isolated rerun in 16.5 seconds total. The
post-relocation production suite passed all 30 tests in 57.6 seconds.
A temporary-storage quota interrupted an initial production browser and Python
audit attempt. On the first final development run, Playwright retried two
scenarios after a quota error closing a browser context and a Chromium target
crash. Both passed on retry. The final development run used a clean artifact
location on the workspace filesystem with retries disabled.

The baseline and ending OpenAPI documents contain 61 operations and matched
byte-for-byte after sorting JSON keys. Both SHA-256 hashes are
`3ce4a0401b144480060c856fc9538ad1ab14817026a890cae8afd832da43e303`.
Persistence coverage includes browser cache keys, migration/write failures,
PostgreSQL projection parity, rollback behavior, and scoped concurrent task writes.

## Docker and runtime validation

- Built both production images and inspected their users as `nextjs` and
  `roadforge`. The development PostgreSQL volume upgraded to the Alembic head
  and reported zero drift. A new disposable self-hosted volume applied all
  revisions through `0011` and also reported zero drift.
- `make deploy-check ENV_FILE=deploy/self-hosted/.env.example` validated the Compose
  configuration. The isolated runtime used the repository's read-only mounts,
  dropped capabilities, nginx routes, PostgreSQL, Redis, and two API workers.
  A temporary override supplied disposable names and volumes and a loopback
  proxy. The probe started after the frontend became healthy so nginx could
  resolve its upstream.
- Requests through nginx confirmed the standalone landing page, optimized images,
  fresh CSP nonces, production docs restriction, secure path-scoped cookies,
  Origin-based CSRF rejection, password enforcement, and MCP doctor against the
  direct loopback API. A separate container confirmed nonce CSP in report-only
  mode. The MCP client reached the live private bridge endpoint with its HTTP
  opt-in and rejected the same endpoint with default settings.
- The two-worker stack delivered a focused mutation through SSE, emitted the
  participant revocation event, and denied the revoked session. The isolated
  API restart preserved the roadmap and owner session while keeping that
  participant revoked. Logs recorded graceful shutdown and startup of both
  workers. A separate container rejected two workers with the memory backend.

## Outstanding failures and deferred work

**PASS.** All final gates passed, including both browser modes, real Redis and
PostgreSQL, performance budgets, and the isolated two-worker Compose smoke test.
There are zero outstanding failures in the final validation matrix. Raw command
logs are available locally in `/tmp/roadforge-modernization/logs/`.

Deferred work follows the approved scope. It includes integer revision tokens,
reorder conflict policy changes, a projection read cutover, error-envelope
redesign, CreateWizard dialog consolidation, CSS migration, and framework-major
upgrades. The local branch carries all implementation checkpoints.
