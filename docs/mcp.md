# MCP integration

RoadForge includes a publishable stdio Model Context Protocol server in
[`packages/roadforge-mcp`](../packages/roadforge-mcp/README.md). It is intentionally a narrow adapter over the
existing participant-scoped API, not a new identity or authorization system.

## Security contract

The MCP host supplies these environment variables:

- `ROADFORGE_API_URL` — RoadForge API origin; defaults to `http://localhost:7878`.

Choose one credential mode:

- `ROADFORGE_INVITE_TOKEN` (or `ROADFORGE_INVITE_URL`) exchanges an invite for one
  in-memory participant session per MCP process. `ROADFORGE_DISPLAY_NAME` defaults
  to `RoadForge Agent`; `ROADFORGE_PASSWORD` is available for protected roadmaps.
- `ROADFORGE_SESSION_TOKEN` plus `ROADFORGE_ROADMAP_ID` reuses an existing session.

Credentials are never accepted as tool arguments, included in results, or written
to stdout. Use a viewer invite for read-only agents and an editor invite only when
task writes are required. Owner credentials also allow explicit claim overrides and
should be reserved for trusted hosts.

## Token-efficient contract

`roadforge_get` defaults to a small summary containing revision, aggregate counts,
phase progress, and bounded next-task IDs. Agents can request compact output filtered
by phase IDs, task IDs, open state, or next-task state. Compact output is capped,
reports omitted matches, excludes descriptions by default, and limits requested
descriptions to 240 normalized characters.

Use `roadforge_task_search` to locate relevant tasks and `roadforge_task_get` to read
one exact task. Full portable JSON remains an explicit mode. Write tools return only
the changed task and its phase rather than echoing the entire roadmap.

## Concurrency

All content writes use RoadForge's exact `updated_at` compare-and-swap token. A tool
may accept `expectedUpdatedAt` from an earlier read; when omitted, the adapter reads
the current revision immediately before writing. Concurrent changes return a 409
conflict with the server revision and a compact conflict summary. The adapter never
silently overwrites or retries a conflicting write.

## Local validation

```bash
pnpm --dir packages/roadforge-mcp check
(cd packages/roadforge-mcp && npm pack --dry-run)
```

Publishing to npm is intentionally separate from merging application changes. The
package name configured for release is `@anvilary/roadforge-mcp`.
