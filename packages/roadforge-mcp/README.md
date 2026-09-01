# RoadForge MCP

A small stdio MCP server for daily RoadForge roadmap work by coding agents. Normal tools use bounded, authenticated API contracts and never need to download the portable roadmap document. The full roadmap remains available only as an explicit escape hatch.

## Local setup

The default API origin is `http://localhost:7878`.

Run the interactive setup once:

```bash
roadforge-mcp setup
roadforge-mcp doctor
```

`setup` asks for:

- API URL, defaulting to localhost;
- roadmap ID;
- RoadForge participant session token.

The token prompt does not echo input. The command refuses to store credentials anywhere inside a Git repository. On POSIX systems the configuration directory is forced to mode `0700` and the configuration file to `0600`.

Default configuration locations are:

- Linux/macOS: `$XDG_CONFIG_HOME/roadforge/mcp.json`, or `~/.config/roadforge/mcp.json` when `XDG_CONFIG_HOME` is unset;
- Windows: `%APPDATA%\RoadForge\mcp.json`.

`ROADFORGE_MCP_CONFIG` may point to another location outside a repository. Do not pass tokens as command-line arguments or place them in model prompts.

`doctor` authenticates with the configured session and calls only the lightweight roadmap revision endpoint. It does not print the session token.

## Environment compatibility

Existing environment-based configuration remains supported and overrides stored configuration:

- `ROADFORGE_API_URL` — API origin;
- `ROADFORGE_ROADMAP_ID` — configured roadmap;
- `ROADFORGE_SESSION_TOKEN` — participant session token.

Invite-based process-local compatibility remains available through `ROADFORGE_INVITE_TOKEN` or `ROADFORGE_INVITE_URL`, plus optional `ROADFORGE_DISPLAY_NAME` and `ROADFORGE_PASSWORD`. Fragment-token invite links are canonical; legacy `?token=` links are accepted only as a migration fallback.

For non-interactive hosts, inject `ROADFORGE_SESSION_TOKEN` through the host environment or secret mechanism rather than shell arguments. Interactive setup intentionally requires a TTY for hidden token entry.

## MCP tools

The advertised solo-oriented tool surface is:

- `roadforge_summary` — roadmap counts, phase progress, revision, and bounded next tasks;
- `roadforge_revision` — current `updatedAt` compare-and-swap token only;
- `roadforge_task_search` — bounded server-side search over IDs, titles, descriptions, phase names/IDs, tags, and assignees;
- `roadforge_task_get` — one full task plus compact phase context;
- `roadforge_task_create`;
- `roadforge_task_update`;
- `roadforge_task_done` — complete or reopen;
- `roadforge_task_delete` — destructive;
- `roadforge_dependency_add`;
- `roadforge_dependency_remove`;
- `roadforge_phase_create`;
- `roadforge_phase_update`;
- `roadforge_phase_delete` — destructive;
- `roadforge_roadmap_rename`;
- `roadforge_tag_create`;
- `roadforge_get` — compatibility summary/compact reads and explicit `mode="full"` portable-roadmap escape hatch.

Task claim/unclaim remains implemented by RoadForge for compatibility, but it is intentionally not part of the primary MCP tool surface while the product is focused on solo/local roadmap work.

## Network-efficiency contract

The normal MCP workflow uses focused API reads:

```text
GET /api/roadmaps/{id}/summary
GET /api/roadmaps/{id}/revision
GET /api/roadmaps/{id}/tasks/search
GET /api/roadmaps/{id}/tasks/{taskId}
GET /api/roadmaps/{id}/context
```

Daily writes use dedicated compact client routes under:

```text
/api/roadmaps/{id}/client/...
```

These routes call the same RoadForge mutation services as browser-facing routes, but return only a compact mutation acknowledgement. Existing browser endpoints and their full `RoadmapResponse` contracts are unchanged.

A task update without `expectedUpdatedAt`, for example, performs:

```text
GET   /api/roadmaps/{id}/revision
PATCH /api/roadmaps/{id}/client/tasks/{taskId}
```

It does **not** perform `GET /api/roadmaps/{id}`. Only `roadforge_get(mode="full")` deliberately calls that full-roadmap endpoint.

Compact 409 conflicts retain the roadmap ID, client/server revisions, and conflict summary needed for recovery without returning the complete server roadmap snapshot.

## Concurrency

Where RoadForge already requires exact optimistic concurrency, MCP preserves it. Pass `expectedUpdatedAt` from a prior focused read when coordinating multiple writes. If omitted for task/tag writes, MCP obtains a fresh token from `/revision` immediately before the mutation. It never silently retries a 409 or weakens compare-and-swap semantics.

## Host configuration example

After `roadforge-mcp setup`, a host can start the executable directly and let it read the user config file:

```json
{
  "mcpServers": {
    "roadforge": {
      "command": "roadforge-mcp"
    }
  }
}
```

Environment-only configuration remains valid:

```json
{
  "mcpServers": {
    "roadforge": {
      "command": "npx",
      "args": ["-y", "@anvilary/roadforge-mcp"],
      "env": {
        "ROADFORGE_API_URL": "http://localhost:7878",
        "ROADFORGE_ROADMAP_ID": "rm_...",
        "ROADFORGE_SESSION_TOKEN": "sess_..."
      }
    }
  }
}
```

Use the host's secret/environment facility when possible rather than committing that JSON with a real token.

## Validation

```bash
cd packages/roadforge-mcp
npm test
npm run check
npm pack --dry-run
```

The regression suite asserts exact HTTP paths so focused tools cannot silently regress to the full-roadmap endpoint.
