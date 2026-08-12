# Self-hosting RoadForge

This is the supported `0.1.0` self-hosting contract. Exact Compose commands and environment
examples live in [`deploy/self-hosted/README.md`](../deploy/self-hosted/README.md). Security
requirements live in [Public deployment security](public-deployment-security.md).

The Anvilary-hosted instance is a **demo/convenience deployment**. It is intended for
evaluation, examples, and light collaboration rather than as a managed team SaaS. Self-hosting
gives operators control over server persistence, backups, retention, monitoring, capacity,
and infrastructure. Roadmap users should still keep **portable JSON exports** of important
work.

If RoadForge becomes part of a real team workflow—especially for a larger team, long-running
roadmap, regulated environment, or workload that needs predictable recovery—fork the
repository or maintain a controlled clone and run an instance the team owns. See
[Hosted demo and self-hosting](hosted-demo-and-self-hosting.md).

## Deployment responsibility

The maintained deployment is a production-oriented reference topology, not a hosted-service
promise or arbitrary team-size certification. A self-hosting operator is responsible for:

- pinning/reviewing the revision being deployed and planning upgrades;
- PostgreSQL durability, backups, restore drills, and retention;
- Redis/multi-worker topology when required;
- TLS, proxy, CORS/origin, CSP, trusted-proxy, and secret configuration;
- capacity planning for CPU, memory, database connections, storage, and expected concurrency;
- external monitoring, alerting, log retention, and incident response;
- load-testing the actual expected team size and usage pattern;
- maintaining organization-specific changes in a fork and deciding when/how to rebase them.

RoadForge does not currently publish a large-team concurrency SLA or capacity number. Do not
infer one from the public demo or from the fact that the reference stack supports Redis and
multiple API workers.

## Supported topology

A production-oriented deployment consists of Next.js, FastAPI, PostgreSQL 16, optional
Redis for shared realtime/rate-limit coordination, and a trusted HTTPS reverse proxy/edge.
Use the maintained files under `deploy/self-hosted/`. Do not expose development servers,
PostgreSQL, or Redis directly to the Internet.

## Required configuration

At minimum configure:

- a production PostgreSQL password/connection;
- `ROADFORGE_ENVIRONMENT=production`;
- `ROADFORGE_WEB_BASE_URL`;
- explicit `ROADFORGE_CORS_ORIGINS`;
- narrow `ROADFORGE_TRUSTED_PROXY_IPS`;
- the appropriate realtime backend/Redis URL;
- `ROADFORGE_CSP_MODE` when deliberately using the bounded CSP observation path.

The public browser Origin must exactly match `ROADFORGE_CORS_ORIGINS`. Those origins govern
both CORS and the defense-in-depth Origin check for unsafe cookie-authenticated roadmap
requests.

## Deployment and updates

For first deploys and schema-sensitive updates:

1. Create and verify a PostgreSQL backup when existing data is present.
2. Build/pull the exact candidate revision.
3. Start required data services.
4. Apply `alembic upgrade head` through the maintained migration command.
5. Start/validate API and web services plus the trusted edge.
6. Run exact-head repository gates and the deployed collaboration/security checks.

The maintained update path is:

```bash
cd /opt/stacks/roadforge/src
make update
```

Application rollback does not undo an applied migration. Do not substitute a
release-specific migration filename for `alembic upgrade head`.

### Internet-hardening migration

Migration `0011_remove_public_viewer_tokens.py` deactivates legacy viewer links whose raw
credential had been stored, clears that material, and drops `share_links.public_token`.
After upgrading, rotate the viewer link once when a new copyable viewer URL is needed.
Rotate any pre-hardening owner/editor invite that may have been distributed as `?token=`.

Existing pre-hardening browser participant Bearers are exchanged automatically for the new
HttpOnly session cookie on the next successful roadmap hydration.

## Runtime confinement

The web/API production images run as non-root users. Maintained Compose additionally uses
read-only web/API root filesystems, capability drops, `no-new-privileges`, PID ceilings, and
narrowly scoped tmpfs write paths. PostgreSQL/Redis retain the writable runtime paths they
actually require.

Keep PostgreSQL and Redis on the internal Docker network and expose the application only via
intended proxy routes.

## Health checks

```text
/api/health/live   process liveness only
/api/health/ready  PostgreSQL + configured Redis readiness
/api/health        backward-compatible readiness alias
```

A readiness `503` means a required dependency is unavailable; it does not by itself prove
the API process is dead.

## Realtime and larger deployments

Memory mode requires exactly one API process:

```sh
ROADFORGE_REALTIME_BACKEND=memory
ROADFORGE_API_WORKERS=1
```

Multiple workers/instances require Redis:

```sh
ROADFORGE_REALTIME_BACKEND=redis
REDIS_URL=redis://...
```

Redis coordinates SSE publication, edit locks, one-time event tickets, revocation state, and
rate limits. Redis-backed public rate limiting fails closed when Redis is unavailable.

For a larger team, switching to Redis/multiple workers is only one part of capacity planning.
The operator must also validate PostgreSQL connections/storage, proxy limits, browser/realtime
concurrency, backup duration, and failure/restore behavior under representative load.

## Access and credential transport

RoadForge has no account/login system. Shared roadmaps use role-scoped invites, optional
roadmap passwords, and participant sessions.

- Generated invites use `/join#token=...`; legacy query-token links are migration-only.
- Owner/editor/viewer raw invite credentials are reveal-once and hashed at rest.
- The web client exchanges a newly issued participant Bearer for a path-scoped HttpOnly,
  `SameSite=Strict`, production-`Secure` session cookie before persisting auth state.
- Cookie-authenticated unsafe requests require an exact configured Origin.
- API/MCP clients intentionally retain explicit `Authorization: Bearer ...` sessions.
- SSE uses a 30-second single-use event-ticket cookie; EventSource URLs contain no secret.

Never paste invite/session/ticket credentials into shell commands, tickets, public issues,
screenshots, analytics, or logs.

## Request limits and untrusted content

The browser, API, and nginx roadmap payload ceiling is **5 MiB**. The API counts actual
streamed bytes rather than trusting only `Content-Length`.

Roadmap/import content and external links are untrusted input. Do not bypass the maintained
Pydantic/browser validators to support malformed data. Task external links reject
credential-like query parameters and are normalized before storage/rendering.

## Backups and retention

PostgreSQL is durable storage for synced roadmaps. Before schema-sensitive releases and
irreversible purge operations, create a custom-format backup, verify it is non-empty, record
a checksum, store it outside the repository/database volume, and periodically perform a
disposable restore drill.

Live-database retention and backup retention are separate lifecycles. Use
[Server data retention and purge](server-data-retention.md) as the authoritative operator
runbook. Hard-purging live rows does not remove historical backups.

The public demo's retention behavior is not a substitute for a team's own recovery policy.
Teams that self-host should deliberately choose and document retention/backup lifecycles that
match their operational and legal requirements.

## Credential-safe logs

RoadForge API logs omit query strings, headers, bodies, cookies, and full URLs. The
maintained nginx format logs `$uri` rather than `$request_uri` and omits Referer.

New invite fragments are not sent upstream and SSE tickets are not URL parameters. Legacy
query-token links can still reach external infrastructure until rotated, so separately review
Cloudflare/tunnel/CDN/proxy error logs and pre-hardening retained logs.

## Content Security Policy

Production RoadForge uses enforced per-response nonce CSP by default. The application—not
nginx—is authoritative for frontend CSP. Nonce-bearing HTML is private/no-store and must not
be cached at the edge.

A bounded `report-only` observation window may be used for the same candidate after a
meaningful frontend/runtime change, but production defaults to `enforce`. Never “fix” a CSP
failure by adding production script `unsafe-inline` or `unsafe-eval`.

`style-src 'unsafe-inline'` remains an explicit compatibility boundary for current dynamic
style attributes; executable scripts remain nonce-restricted.

## Release and capacity verification

Before exposing/updating a public instance, require exact-head CI and then validate the
actual deployment:

1. production CSP is enforced and no conflicting edge CSP exists;
2. create/save a roadmap;
3. generate a fragment editor invite and join in a separate private context;
4. confirm raw participant Bearers are absent from browser localStorage after bootstrap;
5. exercise cookie-authenticated writes and realtime sync;
6. verify invite rotation and participant revocation independently;
7. verify conflict handling and JSON export/import;
8. inspect application and external edge logs for credential leakage using sanitized
   evidence only;
9. confirm backup/rollback readiness for schema-sensitive releases;
10. for operational/larger-team use, run representative concurrency/capacity tests and set
    monitoring thresholds before depending on the deployment.

See [Manual QA](manual-qa.md), [Session policy](security/session-expiry-and-revocation-policy.md),
[Hosted demo and self-hosting](hosted-demo-and-self-hosting.md), and
[`deploy/self-hosted/README.md`](../deploy/self-hosted/README.md).
