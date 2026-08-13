# RoadForge

RoadForge by Anvilary is a local-first roadmap tool for individuals and small teams.
Create phases, tasks, dependencies, tags, and portable backups without an account.
Enable server sync only when you deliberately want sharing and realtime collaboration.

**Release target:** `0.1.0`

> [!IMPORTANT]
> The hosted RoadForge instance at `roadforge.anvilary.tools` is the **official demo/reference
> deployment**. It is for evaluation, examples, and light collaboration; it is not a managed
> team SaaS, enterprise service, or durable storage commitment. There is no hosted SLA,
> reserved per-team capacity, or recovery guarantee. **Export important roadmaps as JSON**
> and keep that file somewhere you control.
>
> If RoadForge becomes part of a real team workflow—especially for a larger team—fork the
> repository or maintain a controlled clone and self-host it. Your deployment should own
> persistence, backups, retention, monitoring, capacity, upgrades, and security configuration.
> See [Hosted demo and self-hosting](docs/hosted-demo-and-self-hosting.md).

RoadForge is currently distributed under the
[PolyForm Noncommercial License 1.0.0](LICENSE). That license is source-available
for non-commercial use and is **not** an OSI-approved open-source license. The
engineering repository is being prepared for the `0.1.0` baseline independently
from any future relicensing decision. Forking or self-hosting does not grant commercial use
outside the current license terms.

## Product contract

RoadForge intentionally keeps its core model small:

- **Local first.** A new roadmap starts in the browser and does not require the API.
- **No accounts.** Shared access uses roadmap-scoped owner, editor, and viewer credentials.
- **Portable.** JSON is the canonical backup/import format. Markdown is a deterministic read-only export.
- **Explicit sync.** Moving a roadmap to a server is a deliberate user action.
- **Recoverable.** Local drafts survive failed saves, conflicts preserve local work, and synced roadmaps support bounded restore history.
- **Operator-owned at scale.** Sustained or larger-team use belongs on infrastructure the team controls rather than the public demo.
- **Simple by default.** Start blank or from a compact three-phase example.

RoadForge is not trying to become an account-based project-management suite. Accounts,
OAuth, billing, generic webhooks, CRDT infrastructure, enterprise tenancy, contractual
support, and automatic GitHub-to-roadmap state mutation are outside the `0.1.0` product
contract.

## Hosted demo vs team deployments

The Anvilary deployment at `roadforge.anvilary.tools` is primarily for trying RoadForge and
demonstrating collaboration. Treat it as evaluation infrastructure rather than the only copy
of important work:

1. Create or open a roadmap.
2. Export **JSON** after meaningful work.
3. Store the JSON in your own filesystem, cloud drive, repository, or backup system.
4. Re-export periodically while the roadmap changes.

For long-running team use, important organizational roadmaps, or larger groups, use a fork or
controlled clone and self-host RoadForge. The maintained deployment is a reference starting
point; RoadForge does not claim arbitrary large-team capacity certification. Operators should
size and load-test their own PostgreSQL/API/Redis topology and own backups, monitoring,
retention, upgrades, and incident response.

Clearing browser site data can remove local-only roadmaps. Deleting a synced roadmap removes
it from normal RoadForge use through server soft deletion; final live-database records are
purged later according to the operator retention policy. Independent database backups may
remain until their own documented expiry. Do not place secrets in roadmap content or exports.

See [Hosted demo and self-hosting](docs/hosted-demo-and-self-hosting.md) and
[Server data retention and purge](docs/server-data-retention.md) for the exact deployment and
data-lifecycle boundaries.

## Access model

RoadForge has no login system or verified personal identities.

- **Owner** — edit, manage sharing and participants, restore versions, override claims, and delete the roadmap.
- **Editor** — edit roadmap content and claim tasks.
- **Viewer** — read roadmap content and activity.

Owner/editor/viewer invite links and participant sessions are bearer credentials. Share them
privately. Viewer invites grant read-only collaboration access; they are not public publishing
links. Display names are collaboration labels, not verified identities.

Task assignees and server participants are separate concepts: an assignee is roadmap
data; a participant is a joined server session.

## Data formats

Browser-local roadmaps are stored in scoped `localStorage`. A storage failure is shown
as a persistent warning rather than being treated as a successful save.

- **JSON** — complete portable roadmap data and the supported re-import format.
- **Markdown** — deterministic human/agent-readable presentation; not importable.

Exports exclude session tokens, invite tokens, passwords, edit locks, and transient
collaboration state.

The maintained import/parser contract lives in
`apps/web/src/lib/roadmap-validation.ts`; TypeScript interfaces and historical design
documents do not override the parser.

## Stack

| Layer | Technology |
| --- | --- |
| Monorepo | pnpm workspace |
| Frontend | Next.js App Router, TypeScript, Tailwind CSS |
| Client persistence | browser `localStorage` |
| Backend | FastAPI, Python 3.12 |
| Database | PostgreSQL 16 |
| Realtime | Server-Sent Events with memory or Redis coordination |
| Migrations | Alembic |
| Agent integration | repository-local stdio MCP package |
| Deployment | Docker Compose and nginx |

## Local development

Reference toolchain:

- Node.js **24** (`.nvmrc`)
- pnpm **9.15.9** (`packageManager`)
- Python **3.12**
- Docker + Docker Compose for the standard backend/test stack

The package manifests currently accept Node `>=22 <27`; Node 24 is the canonical
version used by development and CI.

```bash
git clone https://github.com/alteixeira20/RoadForge.git
cd RoadForge
corepack enable
pnpm install --frozen-lockfile
make start
```

Useful lifecycle commands:

```bash
make help
make status
make logs
make stop
```

Run the normal contributor gate before opening a pull request:

```bash
make release-check
```

The complete exact-head release evidence additionally runs in GitHub Actions, including
browser, Redis, dependency, container, deployment, CSP, and MCP checks.

Focused commands:

```bash
pnpm --dir apps/web test
pnpm --dir apps/web lint
pnpm --dir apps/web typecheck
pnpm --dir apps/web build
pnpm --dir apps/web test:browser:production
pnpm --dir packages/roadforge-mcp check

make api-lock
make api-lint
make api-test
make api-check
make api-audit
```

## Architecture

RoadForge supports two modes:

```text
local roadmap
  browser state -> scoped localStorage -> portable JSON

synced roadmap
  browser cache -> typed web service -> FastAPI
                -> PostgreSQL canonical snapshot + history/activity
                -> derivative relational projection
                -> SSE / Redis volatile coordination
```

For synced roadmaps, `roadmaps.snapshot_json` plus the roadmap tag registry are the
canonical current document. Relational phase/task tables are derivative and must be
rebuildable from the snapshot. Optimistic writes use an exact server revision token;
a stale or future revision does not silently overwrite newer work.

Start with:

- [Architecture overview](docs/architecture/overview.md)
- [Source-of-truth rules](docs/architecture/source-of-truth-rules.md)
- [Access model](docs/access-model.md)
- [Frontend foundation](docs/frontend-foundation.md)
- [Backend API](docs/backend-api.md)

## Health and operations

Public deployments must terminate HTTPS at a trusted edge, configure explicit CORS
origins, restrict trusted proxy addresses, preserve the app-owned CSP, and keep
credentials/query strings out of retained logs.

Health endpoints have one contract:

- `/api/health/live` — process liveness only.
- `/api/health/ready` — PostgreSQL plus configured Redis readiness.
- `/api/health` — backward-compatible alias for readiness.

Use the maintained production-oriented example under
[`deploy/self-hosted`](deploy/self-hosted/README.md) and read
[Public deployment security](docs/public-deployment-security.md) before exposing an instance.
Teams depending on the service should also read
[Hosted demo and self-hosting](docs/hosted-demo-and-self-hosting.md) and establish their own
capacity, backup, monitoring, and rollback expectations.

## Known `0.1.0` boundaries

These are explicit release boundaries, not hidden guarantees:

- browser-local data can be lost when site storage is cleared;
- the hosted Anvilary instance is a demo/reference deployment, not a managed backup, production team, or large-team service;
- larger or operationally important teams should fork/maintain a controlled clone and self-host under the applicable license;
- no arbitrary team-size or concurrency capacity is guaranteed without operator load testing;
- synced roadmap deletion is soft-first; final live-database purge follows the bounded operator retention schedule and backup copies have their own lifecycle;
- production scripts are protected by enforced nonce CSP, while inline CSS remains an explicit compatibility boundary;
- nonce-bearing HTML is dynamically rendered and intentionally not CDN-cacheable;
- MCP currently reuses participant credentials and remains experimental;
- multi-browser/deployed collaboration still requires release-candidate manual validation.

Tracked hardening work should be resolved independently rather than hidden inside new
feature development.

## Contributing

Contributions should be small, reviewable, and backed by the relevant tests. Start with
[CONTRIBUTING.md](CONTRIBUTING.md) and the
[contributor guide](docs/contributor-guide.md). Use the issue chooser for bugs,
usability, documentation, self-hosting, and accessibility reports.

Security vulnerabilities must be reported privately through [SECURITY.md](SECURITY.md).
Never publish invite links, participant session tokens, passwords, private roadmap
exports, database credentials, or unredacted private logs in an issue.

## Release evidence

A release candidate is acceptable only when the exact candidate revision has green
required CI and the relevant deployed/manual checks are complete. A historical green
run does not certify a later commit.

See:

- [Release readiness](docs/release-readiness.md)
- [Manual QA](docs/manual-qa.md)
- [Performance baseline](docs/performance.md)
- [Security documentation](docs/security/README.md)
- [Hosted demo and self-hosting](docs/hosted-demo-and-self-hosting.md)
- [Server data retention](docs/server-data-retention.md)
- [Self-hosting](docs/self-hosting.md)
- [Support](SUPPORT.md)

RoadForge `0.1.0` is intended to be the stable baseline from which future feature work
can proceed without changing these core data-ownership and collaboration principles.
