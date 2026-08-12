# Hosted demo and self-hosting contract

RoadForge is local-first software that can optionally use a server for sharing and realtime
collaboration. The public Anvilary instance at `roadforge.anvilary.tools` is the **official
hosted demo/reference deployment**. It exists so people can evaluate RoadForge, test the
sharing flow, and collaborate lightly without first operating infrastructure.

It is **not** a managed team SaaS, enterprise service, or durable storage commitment.

## What the hosted demo is for

The hosted demo is appropriate for:

- trying RoadForge before deciding whether to run it yourself;
- short-lived examples, prototypes, workshops, and light collaboration;
- validating owner/editor/viewer sharing and realtime behavior;
- seeing the current public release running behind the maintained deployment stack.

Users should keep portable JSON exports of any roadmap they care about. The hosted demo has
no SLA, reserved per-team capacity, guaranteed uptime, hosted-data recovery promise, or
large-team support commitment.

## When to self-host

If RoadForge becomes part of a team's real operating workflow, the team should run an
instance it controls. This is especially important for larger teams, long-running roadmaps,
internal infrastructure, regulated environments, or workloads that need predictable
capacity and recovery procedures.

For that use, **fork the repository or maintain your own controlled clone and self-host it**.
The operator then owns:

- the deployed revision and upgrade cadence;
- PostgreSQL persistence, backups, restore drills, and retention policy;
- Redis and multi-worker topology when horizontal API/realtime coordination is required;
- TLS, domain, proxy, CORS/origin, CSP, and trusted-proxy configuration;
- secrets, host/container security, monitoring, logging, and incident response;
- CPU, memory, database sizing, connection limits, and load/capacity testing;
- organization-specific changes made in a fork and the process for rebasing/upstreaming them.

The maintained `deploy/self-hosted` stack is the reference starting point. It is not a claim
that RoadForge has been capacity-certified for an arbitrary number of users. Teams should
load-test their own expected concurrency and data volume before depending on it operationally.

## Large-team boundary

RoadForge's default product experience is intentionally focused on individuals and small
teams. A larger team may choose to run RoadForge, but the public demo should not be used as
that team's shared production service.

A larger deployment should normally:

1. use a controlled fork/clone pinned to reviewed revisions;
2. run PostgreSQL on durable storage with tested backups;
3. use Redis when multiple API workers or instances are required;
4. define retention and purge policy appropriate to the organization;
5. add external monitoring and capacity alerts;
6. validate realtime, conflict, revocation, backup/restore, and rollback behavior under the
   team's expected concurrency;
7. keep portable JSON exports as an additional user-controlled recovery path.

RoadForge does not currently provide enterprise tenancy, SSO, billing, contractual support,
or a hosted large-team SLA.

## Data ownership

Local-only roadmaps live in browser storage. Synced roadmaps live in the server database
operated by whichever deployment the user chose. In both cases, portable JSON is the user-
controlled backup/interchange format.

The public demo should therefore be treated as **evaluation infrastructure, not the only copy
of important work**. Clearing browser site data can remove local-only roadmaps, and server
retention/backups follow the operator's documented lifecycle.

## License boundary

RoadForge is currently distributed under the PolyForm Noncommercial License 1.0.0. Forking
or self-hosting does not change that license. The current repository license permits the
source-available non-commercial uses it describes; it does **not** grant commercial use.
Organizations must review the applicable license before adopting or modifying RoadForge.

## Related documentation

- [Self-hosting](self-hosting.md)
- [Public deployment security](public-deployment-security.md)
- [Server data retention and purge](server-data-retention.md)
- [Operational proof gate](security/operational-proof-gate.md)
- [Maintained deployment example](../deploy/self-hosted/README.md)
- [Support](../SUPPORT.md)
