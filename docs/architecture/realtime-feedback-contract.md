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
- Full-roadmap remote updates that race an unsaved aggregate edit still preserve the
  browser draft for now. This is a transitional boundary: the server-authoritative
  collaboration work will replace the legacy whole-roadmap local/server choice rather
  than silently discarding either side.
- Task completion and task-field/claim partial writes update immediately from the
  returned roadmap aggregate, then realtime events reconcile other clients.
- Task creation/deletion/reordering/dependency changes, phase edits, roadmap renames,
  tag edits, and imports still use aggregate saves until they receive operation-scoped
  server write contracts.
- Claim conflicts use specific ownership feedback; owner override remains explicit.
- Offline, expired-session, revoked-access, and deleted-roadmap states use persistent
  workspace banners or gates, not transient notifications alone.
- Reconnects may be silent when no user action is required. Repeated identical
  realtime notifications should be coalesced at the caller.

Events and logs must identify actors with participant IDs internally and display names
only for presentation. Raw invite tokens, session tokens, passwords, and authorization
headers must never appear in feedback payloads or logs.
