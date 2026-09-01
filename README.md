# RoadForge

RoadForge by Anvilary is a local-first roadmap tool focused on individual planning.
Create phases, tasks, dependencies, tags, and portable backups without an account.
Optionally back a roadmap with a RoadForge service for durable API and coding-agent
access. Team sharing and live coordination are **in progress — available soon**.

**Release target:** `0.1.0`

> [!IMPORTANT]
> The hosted RoadForge instance at `roadforge.anvilary.tools` is the **official demo/reference
> deployment**. It is for evaluation and examples; it is not a managed team SaaS,
> enterprise service, or durable storage commitment. There is no hosted SLA,
> reserved per-team capacity, or recovery guarantee. **Export important roadmaps as JSON**
> and keep that file somewhere you control.
>
> If RoadForge later becomes part of a real team workflow—especially for a larger team—fork
> the repository or maintain a controlled clone and self-host it. Your deployment should own
> persistence, backups, retention, monitoring, capacity, upgrades, and security configuration.
> See [Hosted demo and self-hosting](docs/hosted-demo-and-self-hosting.md).

RoadForge is currently distributed under the
[PolyForm Noncommercial License 1.0.0](LICENSE). That license is source-available
for non-commercial use and is **not** an OSI-approved open-source license. The
engineering repository is being prepared for the `0.1.0` baseline independently
from any future relicensing decision. Forking or self-hosting does not grant commercial use
outside the current license terms.

## Product contract

RoadForge intentionally keeps its current product model small:

- **Local first.** A new roadmap starts in the browser and does not require the API.
- **Portable.** JSON is the canonical backup/import format. Markdown is a deterministic read-only export.
- **Service backing is optional.** A roadmap can be saved to a RoadForge API/Postgres service for durable machine-local persistence, API access, and MCP/coding-agent access.
- **Service backing is not sharing.** Saving to the API does not mean a roadmap is shared.
- **Team features are dormant.** Share links, participant presence, edit-lock networking, task claims, and realtime/SSE browser coordination are currently disabled and retained for later reactivation.
- **Recoverable.** Local drafts survive failed saves and conflicts preserve local work.
- **Simple by default.** Start blank or from a compact example.

RoadForge is not trying to become an account-based project-management suite. Accounts,
OAuth, billing, generic webhooks, CRDT infrastructure, enterprise tenancy, contractual
support, and automatic GitHub-to-roadmap state mutation are outside the `0.1.0` product
contract.

## Local / solo runtime

The lightweight local runtime is under [`deploy/local`](deploy/local/README.md). It runs:

- `roadforge-web` on `127.0.0.1:3020`;
- `roadforge-api` on `127.0.0.1:7878` with one worker;
- `roadforge-postgres` on the internal Compose network only.

There is no Redis service in this profile. The frontend is built with
`NEXT_PUBLIC_TEAM_FEATURES_ENABLED=false`, so it creates no realtime ticket/SSE connection,
reconnect loop, participant fetch, edit-lock refresh, or claim/share interaction.

Operator commands:

```bash
sh deploy/local/roadforge-local.sh install
sh deploy/local/roadforge-local.sh start
sh deploy/local/roadforge-local.sh status
sh deploy/local/roadforge-local.sh doctor
sh deploy/local/roadforge-local.sh logs
sh deploy/local/roadforge-local.sh restart
sh deploy/local/roadforge-local.sh stop
sh deploy/local/roadforge-local.sh update
```

The update path is non-destructive and preserves the Postgres volume. See the local-runtime
README for state locations and backup guidance.

## Team sharing status

Team sharing and live coordination are currently unavailable in the product surface. The
existing collaboration implementation remains in the repository for later reactivation.

RoadForge has no login system or verified personal identities. The retained collaboration
model uses owner/editor/viewer credentials. **Owner/editor/viewer invite links and participant
sessions are bearer credentials** and must be treated privately when that capability is
reactivated. Viewer invites are not public publishing links.

Task assignees are ordinary roadmap data and remain useful in solo mode. Participant sessions,
claims, edit locks, and presence are collaboration concepts and are dormant in the current
product mode.

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
| Dormant realtime implementation | Server-Sent Events with memory or Redis coordination |
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

Focused commands:

```bash
pnpm check:copy
pnpm check:cycles
pnpm lint
pnpm typecheck
pnpm --dir apps/web test
pnpm --dir apps/web build
pnpm --dir packages/roadforge-mcp check

make api-lock
make api-lint
make api-test
make api-check
make api-audit
```

## Architecture

RoadForge currently supports browser-local roadmaps and optional service-backed roadmaps:

```text
local roadmap
  browser state -> scoped localStorage -> portable JSON

service-backed roadmap
  browser cache -> typed web service -> FastAPI
                -> PostgreSQL canonical snapshot + history/activity
```

Team/realtime paths remain implemented but capability-gated off in the current frontend.
For service-backed roadmaps, `roadmaps.snapshot_json` plus the roadmap tag registry are the
canonical current document. Relational phase/task tables are derivative and must be
rebuildable from the snapshot. Optimistic writes use an exact server revision token;
a stale or future revision does not silently overwrite newer work.

Start with:

- [Architecture overview](docs/architecture/overview.md)
- [Source-of-truth rules](docs/architecture/source-of-truth-rules.md)
- [Access model](docs/access-model.md)
- [Frontend foundation](docs/frontend-foundation.md)
- [Backend API](docs/backend-api.md)

## Hosted demo and self-hosting

The Anvilary deployment at `roadforge.anvilary.tools` is for trying RoadForge. Treat it as
evaluation infrastructure rather than the only copy of important work. Export JSON after
meaningful changes and store it somewhere you control.

For long-running operational use, use a fork or controlled clone and self-host RoadForge.
If team functionality is reactivated for larger groups, operators should size and load-test
their own PostgreSQL/API/realtime topology and own backups, monitoring, retention, upgrades,
and incident response.

See [Hosted demo and self-hosting](docs/hosted-demo-and-self-hosting.md),
[Server data retention and purge](docs/server-data-retention.md), and
[Self-hosting](docs/self-hosting.md).

## Known `0.1.0` boundaries

These are explicit release boundaries, not hidden guarantees:

- browser-local data can be lost when site storage is cleared;
- the hosted Anvilary instance is a demo/reference deployment, not a managed backup or production team service;
- team sharing and live coordination are currently unavailable;
- service backing remains available for persistence, API access, and MCP/coding-agent use;
- synced roadmap deletion is soft-first; final live-database purge follows the bounded operator retention schedule and backup copies have their own lifecycle;
- MCP currently reuses participant credentials and remains experimental; the MCP worker must account for the current solo-mode service/auth contract without requiring frontend realtime.

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
can proceed without changing these core data-ownership principles.
