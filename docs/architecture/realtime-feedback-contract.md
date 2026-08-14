# Realtime Feedback Contract

Status: current pre-release contract

Shared roadmaps treat the server revision as authoritative while preserving local-only
work that can be safely rebased.

- With no local edits, remote roadmap updates refresh local state and may show one
  informational notification.
- Task-scoped remote operations (`task.updated`, completion/reopen, claim/unclaim) are
  fetched from the authoritative server snapshot and rebased immediately onto the
  current browser draft. Unrelated local roadmap, phase, and task edits remain intact.
- A successful task-scoped rebase advances the local `updated_at` base to the server
  revision so a later aggregate save does not intentionally manufacture a stale-write
  conflict for an operation that has already been incorporated.
- If a task-scoped update cannot be reconciled because the task is missing from either
  the local or authoritative snapshot, RoadForge preserves the local draft and does
  not advance its server revision.
- Shared phase name/color/color-mode edits are optimistic, field-scoped server writes.
  The server serializes them against the latest roadmap row rather than requiring a
  whole-roadmap revision token. The originating browser applies the authoritative
  response and advances its revision without marking the whole roadmap dirty.
- Shared roadmap renames use the same server-authoritative pattern. The title updates
  optimistically, rename requests are serialized, late responses cannot overwrite a
  newer title or regress the server revision, and local-only roadmaps retain their
  existing browser-local rename path.
- Remote phase-field and roadmap-rename events refresh authoritative state immediately
  when the receiving browser has no unrelated aggregate draft. Scoped rebasing of
  those structure events onto a dirty aggregate draft remains part of the next
  collaboration boundary.
- Full-roadmap remote updates that race an unsaved aggregate edit still preserve the
  browser draft for now. This is a transitional boundary: the server-authoritative
  collaboration work will replace the legacy whole-roadmap local/server choice rather
  than silently discarding either side.
- Task completion and task-field/claim partial writes update immediately from the
  returned roadmap aggregate, then realtime events reconcile other clients.
- Task creation/deletion/reordering/dependency changes, phase creation/deletion/reorder,
  tag edits, and imports still use their current aggregate or existing dedicated
  contracts until their collaboration-specific write paths are completed.
- Claim conflicts use specific ownership feedback; owner override remains explicit.
- Offline, expired-session, revoked-access, and deleted-roadmap states use persistent
  workspace banners or gates, not transient notifications alone.
- Reconnects may be silent when no user action is required. Repeated identical
  realtime notifications should be coalesced at the caller.

Events and logs must identify actors with participant IDs internally and display names
only for presentation. Raw invite tokens, session tokens, passwords, and authorization
headers must never appear in feedback payloads or logs.
