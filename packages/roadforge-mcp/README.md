# RoadForge MCP

A small stdio MCP server that gives coding agents controlled access to one RoadForge roadmap without sending credentials in prompts or tool arguments.

## Run from the repository

```bash
ROADFORGE_API_URL="https://roadforge.example.com" \
ROADFORGE_INVITE_TOKEN="ed_..." \
ROADFORGE_DISPLAY_NAME="Roadmap Agent" \
node packages/roadforge-mcp/bin/roadforge-mcp.mjs
```

After the package is published, the equivalent command is:

```bash
npx -y @anvilary/roadforge-mcp
```

The easiest configuration uses an owner/editor/viewer invite token. You may provide the raw token through `ROADFORGE_INVITE_TOKEN`, or provide the full generated RoadForge link through `ROADFORGE_INVITE_URL`:

```bash
ROADFORGE_INVITE_URL="https://roadforge.example.com/join#token=ed_..."
```

Fragment-token links are canonical. Pre-hardening `?token=` invite URLs remain accepted by the MCP client only as a migration fallback and should be rotated rather than copied into new configuration.

RoadForge exchanges the invite for one in-memory participant session when the MCP process first calls a tool. For an existing session, set `ROADFORGE_SESSION_TOKEN` together with `ROADFORGE_ROADMAP_ID` instead. Password-protected roadmaps also accept `ROADFORGE_PASSWORD`. Never place credentials in an agent prompt, repository file, tool argument, shell history, or committed environment file.

## Exposed tools

- `roadforge_get`: low-token summary by default, bounded filtered compact context, or full JSON.
- `roadforge_task_search`: search IDs, titles, descriptions, phase names, tags, and assignees without returning the roadmap.
- `roadforge_task_get`: retrieve one task and its phase by stable task ID.
- `roadforge_task_update`: patch title, description, estimate, assignees, tags, or links.
- `roadforge_task_done`: complete or reopen one task.
- `roadforge_task_claim` and `roadforge_task_unclaim`: coordinate active work.
- `roadforge_tag_create`: add optional label/color metadata for a tag ID.

Compact reads can filter by phase IDs, task IDs, open state, or next-task state. They return at most 200 tasks by default, report omitted matches explicitly, and exclude descriptions unless requested. Requested descriptions are whitespace-normalized and capped at 240 characters.

Writes use RoadForge's exact `updated_at` compare-and-swap token. Pass `expectedUpdatedAt` from a previous read when coordinating multiple actions; omit it for a fresh read-before-write.

## Host configuration example

```json
{
  "mcpServers": {
    "roadforge": {
      "command": "npx",
      "args": ["-y", "@anvilary/roadforge-mcp"],
      "env": {
        "ROADFORGE_API_URL": "https://roadforge.example.com",
        "ROADFORGE_INVITE_TOKEN": "ed_...",
        "ROADFORGE_DISPLAY_NAME": "Roadmap Agent"
      }
    }
  }
}
```

The server writes only JSON-RPC messages to stdout. Diagnostic failures are written to stderr and credentials are never logged.
