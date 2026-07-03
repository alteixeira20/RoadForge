# Realtime Feedback Contract

Status: Public Alpha contract

Realtime refreshes must never overwrite unsaved local edits silently.

- With no local edits, remote roadmap updates refresh local state and may show one
  informational notification.
- With unsaved local edits, remote changes preserve the browser state and enter the
  existing conflict/review flow.
- Task completion and claim partial writes update immediately from the returned
  roadmap aggregate, then realtime events reconcile other clients.
- Drag/drop, task edits, phase edits, tag edits, and imports use aggregate saves and
  share the same optimistic-concurrency timestamp.
- Claim conflicts use specific ownership feedback; owner override remains explicit.
- Offline, expired-session, revoked-access, and deleted-roadmap states use persistent
  workspace banners or gates, not transient notifications alone.
- Reconnects may be silent when no user action is required. Repeated identical
  realtime notifications should be coalesced at the caller.

Events and logs must identify actors with participant IDs internally and display names
only for presentation. Raw invite tokens, session tokens, passwords, and authorization
headers must never appear in feedback payloads or logs.
