# Tag Registry Model

Status: canonical foundation for roadmap phase 30

## Storage and ownership

The roadmap tag registry is canonical in `roadmaps.tag_registry_json`. It is
roadmap-scoped and is returned as `tag_registry` by the API and `tagRegistry`
in exported/local roadmap data.

Task `tags` remain an ordered list of stable tag ID strings. Task rows do not
embed labels or colors.

The registry is not part of the relational phase/task projection. Projection
continues to preserve task tag IDs, while the roadmap row owns registry
definitions. A future normalized tag table may replace the JSONB column only
through an explicit migration and parity plan.

## Tag definition

Each definition has:

- `id`: immutable, lowercase kebab-case identifier, maximum 40 characters;
- `label`: required display label, trimmed and whitespace-collapsed, maximum
  80 characters;
- `color`: optional six-digit hexadecimal color in `#rrggbb` form;
- `createdAt`: optional ISO timestamp;
- `updatedAt`: optional ISO timestamp.

Array order is the display order. There is no separate `position` field, which
avoids two ordering authorities.

## Identity and normalization

Generated IDs:

1. normalize the label to lowercase ASCII;
2. replace non-alphanumeric runs with `-`;
3. trim leading and trailing `-`;
4. truncate to 40 characters without leaving a trailing `-`;
5. add `-2`, `-3`, and so on when needed.

Explicit IDs must already match `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

IDs are immutable after creation. Renaming a tag changes only its label. This
prevents a label edit from rewriting every task.

IDs and normalized labels must both be unique within a roadmap. Label
comparison trims, collapses whitespace, and compares case-insensitively.

## Compatibility

Unknown task tag IDs remain valid and render using the raw ID. This is required
for old exports and partially defined registries.

When a roadmap has task tag IDs but no corresponding registry definitions,
clients lazily append definitions with `id` and `label` set to the raw tag ID.
This repair is deterministic and non-destructive.

An explicitly empty imported registry replaces the current registry. The
client then adds fallback definitions only for tag IDs still used by imported
tasks.

## Mutation contract

The full roadmap `PUT` remains the canonical aggregate save and uses
`last_updated_at` optimistic concurrency.

Tag CRUD endpoints are partial writes over the same `tag_registry_json`
column. They must:

- use row locking and `last_updated_at` conflict checks;
- require owner/editor access for writes and allow viewers to list;
- apply the same normalization and uniqueness rules as full saves;
- update roadmap `updated_at`;
- record actor-aware activity;
- publish actor-aware realtime updates;
- use participant rate limits;
- return enough updated roadmap state for clients to advance concurrency.

The UI may use aggregate autosave or partial tag writes, but it must not issue
both for the same local mutation.

## Delete and rename behavior

Renaming and recoloring preserve the stable ID and therefore require no task
rewrite.

Deleting an unused definition removes only the registry entry.

Deleting a definition still used by a task returns a conflict. A future
explicit destructive operation may remove the tag from all tasks, but ordinary
delete never does so implicitly.

## Import and merge

Replace import replaces the registry, including with an empty registry, then
adds fallback definitions for task IDs that remain in use.

Safe-additions merge:

- preserves current definitions;
- adds incoming definitions with new IDs and normalized labels;
- reports same-ID field differences;
- reports same-normalized-label definitions with different IDs or colors;
- never silently recolors, renames, or removes a current definition;
- preserves unknown task tag IDs through fallback definitions.

## Limits

- 200 definitions per roadmap;
- 20 tag IDs per task;
- 40 characters per ID;
- 80 characters per label;
- six-digit hexadecimal colors only.

These limits must match frontend validation, API schemas, import repair, and
database-facing service logic.
