# RoadForge local / solo runtime

This profile is the lightweight one-machine, one-user RoadForge runtime. It keeps browser-first editing and portable JSON, while optionally backing a roadmap with the local RoadForge API and Postgres so API clients and the RoadForge MCP integration can reach durable roadmap state.

Team sharing and live coordination are intentionally disabled in this profile. They are in progress and will be available later. Service backing is not the same thing as sharing.

## Services

The profile runs exactly three persistent application services:

- `roadforge-web` — Next.js UI, bound to `127.0.0.1:3020`.
- `roadforge-api` — RoadForge API, one worker, bound to `127.0.0.1:7878`.
- `roadforge-postgres` — internal-only Postgres 16 with no host port.

There is no Redis service. The frontend is built with `NEXT_PUBLIC_TEAM_FEATURES_ENABLED=false`, so it does not request realtime tickets, create SSE subscriptions, run realtime reconnect loops, refresh edit locks, load participants, or expose task claim/share actions.

## Operator workflow

Run commands from the repository root:

```sh
sh deploy/local/roadforge-local.sh install
sh deploy/local/roadforge-local.sh start
sh deploy/local/roadforge-local.sh status
sh deploy/local/roadforge-local.sh doctor
sh deploy/local/roadforge-local.sh logs
sh deploy/local/roadforge-local.sh restart
sh deploy/local/roadforge-local.sh stop
sh deploy/local/roadforge-local.sh update
```

`install` and `update` are idempotent with respect to application state. `update` rebuilds from the current checkout and applies the compose configuration without deleting the database volume. Normal operation never requires `docker compose down -v` or another destructive reset.

## State and configuration

Browser-local roadmap state remains in the browser storage used by RoadForge. Export important roadmaps as JSON when portability matters.

Service-backed roadmap state lives in the Docker named volume `roadforge_local_postgres`, mounted at `/var/lib/postgresql/data` inside the Postgres container. Treat that volume as persistent application data.

Runtime configuration lives in `deploy/local/.env`. On first operator command it is created from `deploy/local/.env.example` if missing. Change the local Postgres password there before relying on the runtime for long-lived data.

## Backups

Back up both forms of state that matter to you:

1. Export important roadmaps as JSON from the RoadForge UI.
2. Back up the Postgres volume with a consistent Postgres backup, for example `pg_dump` from the running database container or a stopped-volume filesystem backup.

Do not delete `roadforge_local_postgres` during routine upgrades.

## Local endpoints

- Web: `http://127.0.0.1:3020`
- API health: `http://127.0.0.1:7878/api/health`

Only these two user-facing ports are published, and both bind to loopback. Postgres is reachable only inside the compose network.

## MCP integration

The MCP package is intentionally not modified by this slice. It should target the local API endpoint on `127.0.0.1:7878` using the API/session contract it already supports. The important integration rule is that API persistence remains available even though team/realtime browser behavior is disabled.
