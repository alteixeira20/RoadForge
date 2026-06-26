# Assistant Integration Backlog

Status: post-beta plan

Anvilary Roadmaps may expose a future MCP server or equivalent assistant API, but it is not a
beta launch dependency.

## Initial tools

- list roadmaps visible to the current user or explicitly selected local export;
- read roadmap metadata, phases, current tasks, and recommended tasks;
- generate a coding prompt from selected roadmap context;
- propose task creation or updates;
- apply a narrowly scoped task update after explicit user approval.

## Security boundary

- Never expose invite URLs, raw invite tokens, session tokens, passwords, or browser
  storage wholesale.
- Use account/workspace authorization when that platform exists; do not treat display
  names as identity.
- Default to read-only tools.
- Require explicit user approval for each write until a reviewed scoped-consent model
  exists.
- Route writes through normal validation, optimistic concurrency, activity history,
  rate limiting, and realtime events.
- Record tool identity and actor identity in audit metadata.
- Reject broad arbitrary JSON replacement as an assistant write primitive.

## Deferred implementation sequence

1. Finalize account/workspace identity and source boundaries.
2. Define tool schemas and threat model.
3. Implement read-only local/export adapter.
4. Implement authenticated server read tools.
5. Add proposed-write previews.
6. Add narrowly scoped approved writes.
7. Run prompt-injection, secret-exposure, authorization, and auditability review.
