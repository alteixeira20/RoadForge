# Self-Hosting Anvilary Roadmaps

Anvilary Roadmaps is source-available, non-commercial beta software. Review `LICENSE` before
deploying. Commercial hosting and monetized use are not permitted by that license.

## Topology

The supported beta topology is:

- Next.js web app;
- FastAPI API;
- PostgreSQL 16;
- optional Redis for shared realtime, locks, tickets, and rate limits;
- HTTPS reverse proxy.

Use `deploy/hosting-bay/` as the production-oriented Compose example. It requires
explicit secrets, origins, database credentials, web URL, and trusted proxy ranges.

## Deployment sequence

1. Back up PostgreSQL.
2. Build the release images.
3. Start PostgreSQL and Redis.
4. Run `alembic upgrade head`.
5. Run projection backfill with parity verification.
6. Start one API worker for memory mode, or enable Redis before multiple workers.
7. Start the web app and reverse proxy.
8. Verify health, create/join/share, realtime, import/export, and backup restore.

Exact commands and environment variables are documented in
`deploy/hosting-bay/README.md` and `docs/public-deployment-security.md`.

## Authentication modes

The beta has no accounts or OAuth. Access uses role-scoped invite links, optional
roadmap passwords, and participant session tokens. Do not expose owner/editor invite
URLs in logs, screenshots, analytics, or support messages.

## Backups and updates

- Back up PostgreSQL before every migration.
- Export important roadmaps from the browser as an additional portable copy.
- Treat Alembic downgrades as unsupported unless a migration explicitly documents one.
- Review `CHANGELOG.md`, environment changes, and the release checklist before update.
- Test restore procedures; an untested backup is not a recovery plan.

## Operations

Use HTTPS, narrow trusted proxy CIDRs, non-default secrets, private database/Redis
networks, log retention controls, and dependency monitoring. The beta has no uptime,
support, or hosted-data recovery guarantee.
