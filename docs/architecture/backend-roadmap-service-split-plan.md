# Backend Roadmap Service Split

Status: implemented; retained as an architecture record.

Roadmap route handlers remain in `routers/roadmaps.py`. Business logic is split under
`apps/api/src/api/services/`:

- `roadmap_service.py` — create, read, update, delete, conflicts, and activity;
- `roadmap_join_service.py` — invite join and password checks;
- `sharing_service.py` — share links and participants;
- `version_service.py` — checkpoints, list/detail, restore, and retention;
- `roadmap_task_service.py` — task completion and claims;
- `roadmap_tag_service.py` — tag registry reads and writes;
- `roadmap_helpers.py` — shared snapshot, conflict, and response helpers;
- `roadmap_projection_service.py` — derivative projection synchronization.

The split preserved route paths, authorization, schemas, activity, event publication,
and snapshot/version semantics. Further extraction should be driven by concrete module
pressure and handled separately from product behavior changes.
