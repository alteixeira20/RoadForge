# Source-of-Truth Rules

Status: Accepted  
Date: 2026-07-04

## Context

RoadForge is an accountless, local-first roadmap planning tool. A roadmap can
exist only in the browser or be synchronized with RoadForge's API. Planned
GitHub links will connect roadmap tasks to implementation work, but must not
blur ownership of planning state, implementation state, credentials, or
portable roadmap data.

Focused task write endpoints are also replacing some aggregate saves. That work
must reduce full-snapshot write amplification without changing which data is
canonical or changing portable import/export behavior.

The concrete URL-only task link model and its validation/security boundary are
defined in [Task External Links](task-external-links.md).

## Decision

### RoadForge owns roadmap planning

RoadForge owns roadmap intent, sequencing, task planning, and roadmap state.
That includes phases, task order, dependencies, descriptions, estimates,
assignees, tags, completion state, and other RoadForge planning fields.

For synced roadmaps, the RoadForge roadmap snapshot remains canonical.
Relational projections, realtime events, external-link metadata, and other
derived data do not replace it. Local-only roadmaps remain valid and usable
without a server or external provider.

### GitHub owns implementation artifacts

GitHub owns implementation artifacts and their native state: issues, pull
requests, discussions, commits, checks, and related GitHub metadata.

A GitHub link on a RoadForge task is a reference to an implementation artifact.
It is not an automatic roadmap state driver. During alpha:

- GitHub state does not automatically complete, reopen, reorder, or otherwise
  mutate a RoadForge task.
- RoadForge does not provide bidirectional GitHub synchronization.
- A user must explicitly change RoadForge planning state in RoadForge.

If cached GitHub metadata is added later, it must be stored separately from the
roadmap snapshot source of truth. Cache refreshes and cache failures must not
rewrite roadmap planning fields.

### Portable roadmap data remains credential-free

Roadmap JSON imports and exports must remain portable across RoadForge
deployments and usable without GitHub access. They must not contain GitHub
credentials or depend on provider-specific authentication to load.

GitHub credentials must never be stored in:

- roadmap JSON or other import/export payloads;
- roadmap data in `localStorage`;
- task descriptions;
- RoadForge share links; or
- owner, editor, or viewer invite URLs.

This boundary applies to access tokens, refresh tokens, OAuth codes, app
installation credentials, and equivalent secrets. A future integration must
use a separate credential store and explicit security design.

### The accountless model remains a product constraint

GitHub integration must not quietly replace RoadForge's accountless model with
account, login, or identity assumptions. Local-only roadmaps, invite-link
collaboration, participant display names, and credential-free import/export
must continue to work without a GitHub account.

### Partial writes preserve the portable snapshot contract

Focused task writes should reduce full-snapshot write amplification and narrow
mutation scope. They must continue to update the canonical RoadForge state and
keep derivative projections consistent. They must not change import/export
schema, portable round-trip behavior, version restore semantics, or the ability
to export a complete roadmap snapshot.

## Consequences

- RoadForge and GitHub may show different statuses by design.
- GitHub references can enrich task context without becoming planning truth.
- External metadata can be stale or unavailable without corrupting a roadmap.
- Automatic completion and bidirectional synchronization require a future,
  explicit architecture decision; they are not alpha behavior.
- Provider credentials require storage and lifecycle rules outside roadmap
  content and sharing URLs.

## Do / Don't

For future coding agents:

Do:

- Treat RoadForge fields as authoritative for roadmap planning.
- Treat GitHub URLs and IDs as references to GitHub-owned artifacts.
- Keep external metadata caches separate, replaceable, and non-canonical.
- Preserve local-only, accountless, and credential-free workflows.
- Use focused writes to reduce write amplification while preserving the full
  portable roadmap contract.

Don't:

- Infer RoadForge completion or sequencing from GitHub state.
- Add bidirectional synchronization during alpha.
- Put GitHub secrets in roadmap content, browser roadmap storage, exports, or
  shared URLs.
- Require GitHub authentication to open, import, export, or edit a local
  roadmap.
- Make an external metadata cache part of roadmap snapshot truth.
