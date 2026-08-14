# Realtime Feedback Contract

Status: current pre-release contract

Shared roadmaps treat the server revision as authoritative while preserving local-only
work that can be safely rebased.

- With no local edits, remote roadmap updates refresh local state and may show one
  informational notification.
- Task-scoped remote operations (`task.updated`, completion/reopen, claim/unclaim) are
  fetched from the authoritative server snapshot and rebased immediately onto the
  current browser draft. Unrelated local roadmap, phase, and task edits remain intact.
- Shared phase name/color/color-mode and roadmap-name operations are also field-scoped.
  Their realtime metadata identifies the affected phase/roadmap fields, so another
  collaborator's accepted change is rebased directly onto the current browser draft
  even when unrelated aggregate work is dirty.
- Scoped realtime rebases apply all requested fields from one authoritative GET as one
  local-cache update. The browser advances its `updated_at` base only after every
  requested task/phase/roadmap scope was proven reconcilable. If any requested entity
  is missing, RoadForge preserves the local draft and its previous server revision.
- Realtime refresh bursts are single-flight. At most one authoritative GET is active
  per connection attempt plus one coalesced follow-up containing every queued task ID,
  phase field, and roadmap field. A queued full refresh does not erase those scopes:
  if the draft becomes dirty before the follow-up resolves, full replacement is
  skipped while safely scoped changes can still rebase.
- Focused-write responses and realtime responses use monotonic revision ordering. A
  late phase/rename response cannot overwrite a newer collaborator revision, including
  the narrow window before React rerenders the focused write hook with that revision.
  Newer local optimistic operations retain ownership over older queued local responses.
- Shared phase name/color/color-mode edits are optimistic, field-scoped server writes.
  The server serializes them against the latest roadmap row rather than requiring a
  whole-roadmap revision token. The originating browser applies the authoritative
  response and advances its revision without marking the whole roadmap dirty.
- Shared roadmap renames use the same server-authoritative pattern. The title updates
  optimistically, rename requests are serialized, late responses cannot overwrite a
  newer title or regress the server revision, and local-only roadmaps retain their
  existing browser-local rename path.
- Full-roadmap remote updates that race an unsaved aggregate edit still preserve the
  browser draft for now. This is a transitional boundary for mutation surfaces that do
  not yet expose safe focused semantics; RoadForge must not silently replace the draft
  merely because a non-scoped event arrived.
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
