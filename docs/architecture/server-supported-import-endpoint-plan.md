# Server-Supported Import Endpoint Plan

This is a planning note only. The current client-only import, repair, preview,
and merge flow remains canonical for now.

## Why Add Server Support Later

A server import endpoint may be needed once imports affect shared roadmaps with
multiple active collaborators, richer audit requirements, larger files, or
account/workspace ownership. Server support would let Anvilary Roadmaps validate and
apply imports transactionally, enforce authorization in one place, reject stale
writes before mutation, and create consistent activity/version records.

Until that work is explicitly implemented, imports continue to run in the web
client. Synced roadmap changes still persist through the existing full snapshot
save path.

## Proposed Endpoints

- `POST /api/roadmaps/{id}/imports/preview`: validate, repair, upgrade, and
  summarize an import without mutating the roadmap.
- `POST /api/roadmaps/{id}/imports/apply`: revalidate the previewed import and
  apply the selected import mode in one transaction.

`new-local` remains client-only unless Anvilary Roadmaps later adds accounts,
workspaces, or server-owned personal drafts. The server endpoints should only
cover mutations to an existing server roadmap.

## Authorization

- Owners and editors may preview merge/replace imports.
- Owners and editors may apply `safe-additions` and `replace-current`.
- Viewers may not mutate. A viewer preview endpoint is optional, but it must not
  issue apply tokens or imply write permission.
- Bearer session authorization should match the existing roadmap update rules.

## Request Shape

Preview request, high level:

```json
{
  "mode": "safe-additions",
  "payload": {
    "schema": "roadforge.roadmap.export",
    "version": 1,
    "phases": []
  },
  "client_last_updated_at": "2026-05-29T10:00:00Z"
}
```

Apply request, high level:

```json
{
  "mode": "safe-additions",
  "payload": {},
  "preview_id": "optional-server-preview-id",
  "last_updated_at": "2026-05-29T10:00:00Z",
  "acknowledged_destructive_replace": false
}
```

The first implementation can avoid storing preview state and require the full
payload again on apply. If a `preview_id` is introduced, it should be short
lived, scoped to the participant session and roadmap, and not bypass
revalidation.

## Response Shape

Preview response, high level:

```json
{
  "mode": "safe-additions",
  "roadmap": {
    "id": "rm_...",
    "updated_at": "2026-05-29T10:00:00Z"
  },
  "summary": {
    "phases_added": 1,
    "tasks_added": 4,
    "matched_phases": 2,
    "matched_tasks": 8,
    "conflicts_count": 1,
    "skipped_count": 1,
    "repairs_count": 0,
    "warnings_count": 0,
    "conflicts": []
  },
  "repairs": [],
  "warnings": []
}
```

Apply response should return the normal roadmap response shape plus the import
summary that was applied. This keeps the frontend aligned with existing
`Roadmap` mapping while still showing import results.

## Import Modes

- `safe-additions`: add only imported phases and tasks that do not match current
  data; never overwrite matched entities.
- `replace-current`: replace the current roadmap phases, and optionally the name
  if the imported file includes one.
- `new-local`: keep client-only unless future account/workspace behavior gives
  the server a destination for an imported draft.

`replace-current` apply must require an explicit destructive acknowledgement in
the request. A missing acknowledgement should return `400 Bad Request`.

## Conflict Model

The server should mirror the current frontend import types:

- conflict types: `task-field-conflict`, `id-collision`;
- entity kinds: `phase`, `task`;
- match strategies: ID first, then conservative fallback, otherwise no match;
- field diffs: current value, imported value, and field name.

Fallback matching should remain conservative: phase fallback only when the
normalized phase name is unique, and task fallback only within the matched
current phase when the normalized title is unique. Ambiguous fallback must not
silently merge.

## Concurrency

`/imports/apply` must require `last_updated_at`, using the roadmap timestamp
observed during preview. If the roadmap changed after preview, return
`409 Conflict` and do not mutate.

The 409 body should include the current `updated_at`, the client timestamp, and
enough metadata for the client to re-run preview. It must not include session
tokens, invite tokens, password data, or secrets.

## Server Responsibilities

The server must re-run the same classes of checks currently handled by the
client:

- JSON envelope recognition and backward-compatible export/import support;
- roadmap schema upgrade;
- deterministic repair of missing required IDs/titles where safe;
- duplicate task ID repair or rejection before merge;
- stale dependency and `parentId` cleanup for added tasks;
- field length, phase/task count, array length, unsafe key, control character,
  and suspicious text validation;
- progress normalization.

The apply endpoint must not trust a prior client preview. It should validate,
repair, upgrade, preview, check concurrency, then mutate within one transaction.

## Audit, Activity, And Versions

Successful apply should create an activity entry with the actor, mode, counts,
and skipped/conflict totals. `replace-current` should be clearly labeled as a
destructive import.

Version behavior should follow the existing full-save policy. At minimum,
`replace-current` should create a version/checkpoint-equivalent snapshot before
or during apply so recovery is possible. `safe-additions` can follow the normal
save/version threshold unless product policy requires every server import to be
versioned.

Failed preview/apply attempts should not create activity rows, but security
logging can record rejected oversized, unauthorized, or malformed requests
without storing full import payloads.

## Limits And Abuse Controls

- Reuse the current import payload limit unless product requirements justify a
  larger server-only size.
- Enforce phase, task, string, tag, assignee, and dependency limits before any
  database mutation.
- Apply endpoint rate limits should be stricter than preview limits because
  apply can write and create activity/version records.
- Rate limits should be per session, roadmap, and client IP where available.
- Reject compressed or nested payload tricks unless explicitly supported.

## Sensitive Data Rules

Imports and exports must never include session tokens, invite tokens, password
hashes, plaintext passwords, browser storage state, cookies, SSE tickets,
authorization headers, API keys, or server secrets.

The current export envelope includes roadmap metadata and collaborator display
context only. A server endpoint should preserve that boundary and ignore unknown
sensitive-looking fields instead of storing them.

## Migration Path

1. Keep the current client implementation as the reference behavior.
2. Extract shared fixtures from the import/merge tests so server tests can prove
   parity.
3. Implement server preview behind an internal feature flag or unused endpoint.
4. Add server tests for repair, fallback matching, ID collision handling,
   destructive acknowledgement, authorization, and 409 stale apply.
5. Switch the synced-roadmap frontend path to server preview/apply only after
   parity is proven.
6. Keep `new-local` and offline/local imports on the client.
7. Remove duplicated client merge mutation logic only after the server endpoint
   is stable and rollback is documented.
