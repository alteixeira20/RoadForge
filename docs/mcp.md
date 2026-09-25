# MCP integration

RoadForge includes a publishable stdio Model Context Protocol server in [`packages/roadforge-mcp`](../packages/roadforge-mcp/README.md). It is an adapter over the existing participant-scoped RoadForge API, not a second authorization system or a second roadmap business-logic implementation.

## Security and local configuration

The API origin defaults to `http://localhost:7878`.

For local use, configure the package interactively:

```bash
roadforge-mcp setup
roadforge-mcp doctor
```

`setup` reads the session token with terminal echo disabled and stores it outside Git repositories. On POSIX systems the user configuration directory is mode `0700` and the file is mode `0600`. The default file is `$XDG_CONFIG_HOME/roadforge/mcp.json` or `~/.config/roadforge/mcp.json`; Windows uses `%APPDATA%\RoadForge\mcp.json`. `ROADFORGE_MCP_CONFIG` may override the path, but repository-local credential paths are rejected.

Existing environment configuration is preserved and takes precedence over stored values:

- `ROADFORGE_API_URL`;
- `ROADFORGE_SESSION_TOKEN`;
- `ROADFORGE_ROADMAP_ID`.

Process-local invite compatibility also remains through `ROADFORGE_INVITE_TOKEN` or `ROADFORGE_INVITE_URL`. Invite exchange still creates an ordinary authenticated participant session; localhost does not grant an authorization bypass.

Credentials are never accepted as MCP tool arguments or printed by `doctor`. Non-interactive hosts should inject secrets through their environment/secret facility rather than shell arguments or model prompts.

## Focused read API

Authenticated owner/editor/viewer clients can use these bounded reads:

| Route | Response | Purpose |
| --- | --- | --- |
| `GET /api/roadmaps/{id}/summary` | `RoadmapSummaryResponse` | Roadmap identity/revision, phase progress, aggregate task counts, bounded next tasks |
| `GET /api/roadmaps/{id}/revision` | `RoadmapRevisionResponse` | Current `updated_at` only |
| `GET /api/roadmaps/{id}/tasks/search` | `TaskSearchResponse` | Server-side bounded task search |
| `GET /api/roadmaps/{id}/tasks/{taskId}` | `TaskDetailResponse` | One full task plus compact phase context |
| `GET /api/roadmaps/{id}/context` | `RoadmapContextResponse` | Bounded filtered task context for compatibility compact reads |

Task search accepts query text, `include_completed`, and a maximum result count capped at 100. It searches task ID/title/description, phase ID/name, tags, and assignees, but broad results omit task descriptions.

Context reads accept bounded phase/task ID filters, `open_only`, `next_only`, optional description previews, and a result limit. Description previews are opt-in, whitespace-normalized, and capped at 240 characters.

### Internal read authority

Focused reads intentionally use RoadForge's existing authoritative read service rather than directly treating relational projection tables as a new source of truth. The existing read service already owns the certified projection policy: projection reads are feature-flagged, parity-checked against the canonical snapshot, and fall back to the snapshot on drift or read failure. Reimplementing direct projection queries in this slice would duplicate those authority/fallback semantics.

Therefore this slice removes full-roadmap **network transfer** without redesigning persistence authority. A future internal optimization can add focused relational query helpers once they can reuse the same parity/source-of-truth boundary without introducing a second policy.

## Compact mutation API

Existing browser-facing mutation routes are unchanged and continue returning their existing `RoadmapResponse` contracts.

MCP uses dedicated owner/editor client routes under `/api/roadmaps/{id}/client`:

- `PATCH /client/tasks/{taskId}`;
- `PATCH /client/tasks/{taskId}/done`;
- `POST /client/phases/{phaseId}/tasks`;
- `DELETE /client/tasks/{taskId}`;
- `PUT /client/tasks/{taskId}/dependencies/{dependencyId}`;
- `DELETE /client/tasks/{taskId}/dependencies/{dependencyId}`;
- `POST /client/phases`;
- `PATCH /client/phases/{phaseId}`;
- `DELETE /client/phases/{phaseId}`;
- `PATCH /client/name`;
- `POST /client/tags`.

Every client route delegates to the same existing mutation service as its browser counterpart and shares the equivalent authorization and rate-limit budget. Successful writes return `CompactMutationResponse`, containing the roadmap ID/revision and only affected task/phase/tag/dependency state where useful.

Optimistic-concurrency conflicts on client routes are explicitly documented as `CompactRoadmapConflictResponse`. They preserve roadmap ID, client/server revisions, and the existing compact conflict summary while omitting the complete server roadmap snapshot. Existing browser 409 contracts are unchanged.

## MCP tool surface

The primary tools are:

```text
roadforge_summary
roadforge_revision
roadforge_task_search
roadforge_task_get
roadforge_task_create
roadforge_task_update
roadforge_task_done
roadforge_task_delete
roadforge_dependency_add
roadforge_dependency_remove
roadforge_phase_create
roadforge_phase_update
roadforge_phase_delete
roadforge_roadmap_rename
roadforge_tag_create
roadforge_get
```

`roadforge_task_delete` and `roadforge_phase_delete` are marked destructive. Claim/unclaim is intentionally not advertised as part of the solo-oriented default workflow; the backend collaboration implementation remains intact.

`roadforge_get` keeps compatibility modes:

- `summary` uses `/summary`;
- `compact` uses bounded `/context`;
- `full` explicitly downloads `GET /api/roadmaps/{id}`.

Only `mode="full"` is allowed to deliberately fetch the complete portable roadmap JSON.

## Representative request behavior

Task search previously required:

```text
GET /api/roadmaps/{id}
client-side scan of every phase/task
```

It now performs:

```text
GET /api/roadmaps/{id}/tasks/search?query=...&limit=...
```

A task update without a supplied revision previously required:

```text
GET   /api/roadmaps/{id}
PATCH /api/roadmaps/{id}/tasks/{taskId}
<- full RoadmapResponse
```

It now performs:

```text
GET   /api/roadmaps/{id}/revision
PATCH /api/roadmaps/{id}/client/tasks/{taskId}
<- CompactMutationResponse
```

MCP tests assert these exact HTTP paths, including the rule that normal focused tools must never call the full-roadmap GET.

## Validation

```bash
cd packages/roadforge-mcp
npm run check
npm pack --dry-run
```

API integration tests cover focused read shapes, bounds, auth roles, typed compact writes/conflicts, OpenAPI truthfulness, 404/409 behavior, and preservation of the existing browser mutation response contract.
