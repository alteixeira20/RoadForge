# Backend Roadmap Service Split Plan

Status: staged post-validation refactor plan

`roadmap_service.py` remains behaviorally stable through the beta release. Split it
only after the current API and migration suite passes, one domain at a time.

## Target modules

- `roadmap_core_service.py`: create, read, update, delete, conflict snapshots;
- `roadmap_join_service.py`: invite lookup, password checks, participant sessions;
- `roadmap_sharing_service.py`: share-link list, rotate, and revoke;
- `roadmap_participant_service.py`: participant list and revoke;
- `roadmap_version_service.py`: checkpoints, list, detail, restore, retention;
- `roadmap_task_service.py`: task completion and claims;
- `roadmap_tag_service.py`: tag registry partial writes;
- `roadmap_activity_service.py`: activity persistence and listing.

Shared helpers for row locking, response conversion, activity creation, projection sync,
and event publication should move only when at least two extracted modules need them.

## Sequence

1. Freeze route behavior with current tests.
2. Extract version functions and run focused tests.
3. Extract share links and participants.
4. Extract join/session behavior.
5. Extract task and tag partial writes.
6. Reduce the remaining core service.

Do not combine extraction with schema, authorization, response-shape, or event changes.
