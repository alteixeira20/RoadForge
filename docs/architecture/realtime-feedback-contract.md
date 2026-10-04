# Realtime Feedback Contract

Status: current pre-release contract

Shared roadmaps treat the server revision as authoritative while preserving local-only
work that can be safely rebased.

- Ordinary remote collaborator edits are silent. Edits from collaborators appear automatically
  without page reloads, visible refreshes, flashing, focus loss, conflict modals, banners,
  or repetitive toasts. No toasts or modals are shown for successful local saves or remote edits.
- Remote authoritative updates are applied non-dirtily: applying received
  state does not mark the roadmap unsaved (`saved: false`) and does not schedule aggregate autosync.
- Own-event echo suppression: originating clients use participant IDs, operation generations,
  and monotonic timestamps to safely ignore their own SSE events, avoiding secondary writes,
  full-document refetches, or oscillation between saving and live states.
- Task-scoped remote operations (`task.updated`, completion/reopen, claim/unclaim) and
  tag-scoped remote operations (`tag_id`, `tag_ids`) are fetched from the authoritative
  server snapshot and rebased immediately onto the current browser draft without replacing
  unrelated entities. Unrelated local roadmap, phase, and task edits remain intact.
- Password change events (`action="roadmap.password_changed"`, `is_password_enabled`) update
  the local state and auth cache directly without refetching the full document.
- Phase create/delete/reorder is structure-scoped. Realtime metadata identifies affected
  phase IDs and/or an order change, while one authoritative GET supplies the final server
  phase set/order. A remote create adds/replaces only the affected entity, a remote delete
  removes the final-absent affected phase and cleans dependencies to its deleted tasks,
  and reorder applies server-known phase order without replacing unrelated phase/task
  contents. Local-only pending phases remain present after the server-known set.
- Structural event bursts are coalesced by final authoritative state rather than replayed
  as a speculative client operation log. If create/delete events for the same phase race,
  the final GET decides whether that phase exists. If final deletion makes a queued task
  or phase-field scope inside that deleted phase obsolete, that explained absence does not
  block reconciliation; unexplained missing entities still do.
- Scoped realtime rebases apply all requested fields/structure from one authoritative GET
  as one local-cache update. The browser advances its `updated_at` base only after every
  non-obsolete requested task/phase/roadmap scope was proven reconcilable. If an entity is
  missing without an authoritative structural deletion explaining it, RoadForge preserves
  the local draft and its previous server revision.
- Realtime refresh bursts are single-flight. At most one authoritative GET is active
  per connection attempt plus one coalesced follow-up containing every queued task ID,
  phase field, phase structure scope/order signal, and roadmap field. A queued full refresh
  does not erase those scopes: if the draft becomes dirty before the follow-up resolves,
  full replacement is skipped while safely scoped changes can still rebase.
- Focused-write responses and realtime responses use monotonic revision ordering. A
  late phase/rename response cannot overwrite a newer collaborator revision, including
  the narrow window before React rerenders the focused write hook with that revision.
  Newer local optimistic operations retain ownership over older queued local responses.
- Shared phase name/color/color-mode edits are optimistic, field-scoped server writes.
  The server serializes them against the latest roadmap row rather than requiring a
  whole-roadmap revision token. The originating browser applies the authoritative
  response and advances its revision without marking the whole roadmap dirty.
- Shared phase create/delete/reorder writes are optimistic focused operations guarded by
  a reference-counted aggregate-save barrier. New phase IDs use collision-resistant Web
  Crypto UUIDs; the historic blank starter phase keeps its deterministic portable ID.
  A forced duplicate-ID rejection cancels dependent local writes and must not erase an
  already-observed authoritative remote winner.
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
- Task creation/deletion/reordering/dependency changes, tag workflow mutations, imports,
  and restore remain later collaboration/audit surfaces. Import and restore are
  deliberately aggregate/destructive operations and require explicit recovery semantics
  rather than being converted mechanically into partial writes.
- Claim conflicts use specific ownership feedback; owner override remains explicit.
- Offline, expired-session, revoked-access, and deleted-roadmap states use persistent
  workspace banners or gates, not transient notifications alone.
- Reconnects may be silent when no user action is required. Repeated identical
  realtime notifications should be coalesced at the caller.

Events and logs must identify actors with participant IDs internally and display names
only for presentation. Raw invite tokens, session tokens, passwords, and authorization
headers must never appear in feedback payloads or logs.
