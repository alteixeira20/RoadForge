# RoadForge — Session Expiry and Revocation Policy

Status: implemented policy. See
[`security-hardening-implementation-notes.md`](./security-hardening-implementation-notes.md)
for the shipped code paths and validation scope. Optional token rotation and hard
session caps described below remain future work.

RoadForge is accountless. Access is controlled by role-scoped invite links, optional roadmap passwords, and participant session tokens stored by the browser. The policy below keeps that model while reducing the risk of long-lived stolen sessions.

---

## 1. Current session model

When a roadmap is saved to the backend, the API creates:
- One `Roadmap` row.
- One owner `Participant` row.
- One share link per role: `owner`, `editor`, and `viewer`.
- One owner session token returned once as `owner_session_token`.

When someone opens `/join?token=...`, `POST /api/roadmaps/join` resolves the active share link, checks the optional roadmap password, creates a new `Participant`, and returns a one-time `session_token`. The frontend stores that token in scoped local storage under `rf:auth:{roadmapId}` with the server roadmap ID, participant ID, and role. Roadmap content is stored separately under `rf:roadmap:{roadmapId}` so the browser can hydrate from the local cache before or without a server refresh.

Session tokens are bearer credentials. Protected API calls send `Authorization: Bearer <session_token>`. The backend hashes the raw token and looks up a non-revoked, non-expired participant for the requested roadmap. Successful authenticated requests renew the 30-day sliding expiry and update `Participant.last_seen_at` when the presence timestamp is stale.

Share-link revocation and participant revocation are different controls:
- Share-link revocation or rotation stops future joins with that invite token. It does not currently revoke already-created participant sessions.
- Participant revocation sets `Participant.revoked_at`, makes that participant's existing session fail auth, and broadcasts `participant.revoked` over SSE to that participant's active connections.

Roadmap deletion is broader than participant revocation. `DELETE /api/roadmaps/{id}` soft-deletes the roadmap, deactivates active share links, and broadcasts `roadmap.deleted` to connected participants.

Participant display names are not accounts. They are labels stored on `Participant` rows for collaboration UI, activity logs, locks, and owner Team views. They are not identity proof, are not globally unique, and should not be used as an authorization primitive.

Participant sessions have a modeled 30-day sliding expiry. Expired sessions fail
authentication and may rejoin through an active invite link.

---

## 2. Security goals

- Keep accountless collaboration as the primary product model.
- Avoid adding accounts, OAuth, email verification, password reset, or a global identity system.
- Limit the useful lifetime of stolen `sess_` tokens stored in browser `localStorage`.
- Preserve local-first recovery: cached roadmap content must remain available when auth fails.
- Keep owner controls understandable: revoke a person, rotate or revoke a link, delete a roadmap.
- Avoid surprising users during normal collaboration, especially while editing.
- Keep first implementation small enough to ship safely and roll back.
- Maintain current SSE architecture; do not introduce WebSockets for expiry.

---

## 3. Current policy

Implemented first-version defaults:

| Policy area | Recommendation |
|---|---|
| Participant session lifetime | 30 days absolute maximum from issue or last renewal. |
| Idle timeout | No separate idle timeout in the first version. |
| Renewal | Sliding renewal on successful authenticated API requests. |
| Renewal window | Extend `session_expires_at` to `now + 30 days` when the session is valid and not revoked. |
| `last_seen_at` | Keep updating it on successful authenticated requests when stale for owner visibility and operational debugging. |
| Owner sessions | Same 30-day sliding lifetime as editor/viewer sessions in the first version. |
| Role differences | No expiry difference by role initially. Use role only for authorization, not session lifetime. |
| Public viewer link | The invite link may remain stable and public while active; each joined viewer session still gets its own 30-day sliding expiry. |
| Expired session | Authentication fails because the session aged out. The participant is not revoked and may rejoin through an active link. |
| Revoked session | Authentication fails because owner action or roadmap deletion intentionally removed access. Revoked sessions never renew. |

A separate idle timeout is not recommended initially. Sliding 30-day expiry already limits stolen-token lifetime while avoiding churn for legitimate accountless collaborators who return periodically. A hard idle timeout can be added later if owner-facing session metadata shows a real need.

Expired sessions should preserve local cached roadmap content and ask the user to rejoin. Revoked sessions should also preserve the local copy to avoid silent data loss, but the UI copy should clearly state that access was removed by owner action or roadmap deletion.

---

## 4. Database/model design

Current and optional backend fields:

- `Participant.session_expires_at datetime timestamptz null`: implemented expiry timestamp for the participant's current session. New sessions set this to `now + 30 days`; the migration backfilled existing rows.
- `Participant.last_seen_at datetime timestamptz null`: already exists. Continue using it for visibility and renewal decisions, but do not treat it as the source of truth for expiry.
- `Participant.revoked_at datetime timestamptz null`: already exists. It remains the source of truth for owner-initiated participant revocation.
- `Participant.revoked_reason text null` or enum-like string, optional: useful later to distinguish `owner_revoked`, `roadmap_deleted`, `password_policy`, or administrative actions. Do not block the first version on it.
- `Participant.session_version integer not null default 1`, optional: useful if token rotation is later added and old tokens need invalidation without changing participant identity.
- Token rotation metadata, optional: `last_rotated_at`, `previous_token_valid_until`, or a child session table only if rotation becomes necessary. Do not add this in the first implementation unless there is a concrete rotation requirement.

Do not model global users, accounts, email addresses, OAuth subjects, or device identities for RF-825.

---

## 5. API behavior

Endpoint shapes remain stable. Expiry is enforced in the central auth path that
verifies bearer session tokens and `revoked_at`.

Expected behavior:

- Authenticated roadmap fetch: `GET /api/roadmaps/{id}` should require a valid, non-revoked, non-expired session. On success, update `last_seen_at` and renew `session_expires_at` when the participant presence timestamp is stale.
- Update/save: `PUT /api/roadmaps/{id}` should reject expired and revoked sessions before concurrency checks or writes. Expiry must not create activity logs.
- Share management: owner-only share-link list, rotate, and revoke endpoints should reject expired owner sessions as expired auth, not as insufficient role.
- Participant list: owners receive `last_seen_at`, `revoked_at`, and
  `session_expires_at`; editors receive only active participant IDs, names, roles, and
  current-participant state.
- Join/rejoin: `POST /api/roadmaps/join` should create a new participant session when the invite link is active and password checks pass. Rejoining after expiry can create a new `Participant` row initially; merging with an old expired participant can be deferred.
- Expired session response: return `401 Unauthorized` with a stable detail such as `"Session expired"`.
- Revoked session response: return `401 Unauthorized` with a stable detail such as `"Session revoked"` when the token maps to a revoked participant.
- Missing or unknown token response: keep `401 Unauthorized` with `"Missing or invalid session token"`.
- Role failure: keep `403 Forbidden` with `"Insufficient permissions"` for valid, non-expired sessions whose role is not allowed.
- SSE ticket request: `POST /events/ticket` should reject expired sessions and should not issue a ticket.
- Existing SSE stream: a session that expires while already connected will not receive an expiry event unless the server actively checks stream participants. First version can rely on the next ticket refresh, authenticated fetch, lock, or save to discover expiry. Do not add WebSockets.
- `participant.revoked`: keep broadcasting to the target participant when owner revokes that participant.
- `roadmap.deleted`: keep broadcasting to all connected participants when the roadmap is deleted.
- Optional future SSE event: `participant.session_expired` is not required for the first version. If added later, it should be best-effort UX only; API enforcement remains authoritative.

Expired and revoked errors should be machine-distinguishable by response detail so the frontend can show accurate copy, while still returning `401` for both because neither session may continue.

---

## 6. Frontend behavior

The frontend should preserve local-first behavior and avoid data loss.

When a session expires:
- Stop treating the browser as authenticated for that roadmap.
- Clear only `rf:auth:{roadmapId}` or remove the expired token from it.
- Keep `rf:roadmap:{roadmapId}` exactly as the local cached copy.
- Mark the roadmap as unsynced or local-only in state (`saved: false`) if the user has unsynced edits or if the server can no longer be reached with the old token.
- Show a banner or toast explaining that the session expired and the user must rejoin from an active invite link.
- Route or prompt to the rejoin flow without deleting local changes.
- If the user rejoins successfully, keep the local cached copy available and reconcile through the existing save/concurrency flow.

When a participant is revoked:
- Current SSE behavior should remain: `participant.revoked` clears auth, resets server identity state, marks the local cache unsaved, and surfaces access loss.
- The message should make clear that access was revoked by an owner.
- Do not auto-rejoin or silently retry with the same token.
- Do not delete the local roadmap cache.

When a roadmap is deleted:
- Current SSE behavior should remain: `roadmap.deleted` clears auth and marks the local copy unsaved.
- The message should explain that the server roadmap was deleted.
- Keep the local cached copy as a recovery/export source unless the user explicitly removes it from the browser.

Storage cleanup rules:
- Clear expired or revoked auth tokens from `rf:auth:{roadmapId}`.
- Preserve `rf:roadmap:{roadmapId}`.
- Preserve display name (`rf:displayName`) because it is not an access credential.
- Do not clear other roadmap caches.
- Do not silently delete local unsynced edits.

Rejoin flow:
- The user should enter or paste a fresh invite link. If the roadmap has a password, the existing password gate applies.
- A successful rejoin stores the new session token and role under `rf:auth:{roadmapId}`.
- Viewer rejoin routes to `/shared`; owner/editor rejoin routes to `/workspace`, matching current join behavior.
- If local edits conflict with the server snapshot after rejoin, use existing optimistic concurrency behavior and show conflict/offline messaging rather than overwriting local work.

---

## 7. Revocation policy

Owner revokes participant:
- Set `Participant.revoked_at`.
- Reject that participant's existing session on all protected endpoints.
- Broadcast `participant.revoked` to the target participant's active SSE connections.
- Do not revoke the share link they originally used.
- The participant may rejoin if they still have an active invite link and the optional roadmap password.

Owner revokes or rotates share link:
- Revoke/rotate only affects future joins with that link token.
- Existing participant sessions created through the old link survive until they expire or are individually revoked.
- This keeps link hygiene understandable: rotate a leaked invite link without unexpectedly kicking active collaborators.

Roadmap deleted:
- Soft-delete the roadmap and deactivate active share links.
- Broadcast `roadmap.deleted`.
- Existing participant sessions become unusable because the roadmap is no longer active.
- Local browser caches remain the user's recovery copy.

Password changed or disabled:
- Password support currently applies at join time. If password editing is added later, password changes should not automatically kick existing participants in the first implementation.
- Changing or disabling the password should affect future joins only.
- If the product later needs "reset password and remove everyone" behavior, implement it as an explicit owner action that revokes participants or increments a session version.

Existing sessions and link rotation:
- Existing sessions survive link rotation and link revocation.
- Participant revocation is the control that kicks existing participants.
- Expiry is automatic session aging, not an owner revocation.

---

## 8. Renewal and rotation strategy

Recommended first version:
- Extend expiry on successful authenticated requests.
- Do not issue refresh tokens.
- Do not rotate session tokens automatically.
- Do not add a session table or multi-token infrastructure.
- Treat the existing `sess_` token as the single bearer credential for a participant session.

Justification:
- RoadForge is accountless; refresh tokens add complexity without a user account boundary.
- The current client already stores one token per roadmap in local storage.
- Sliding 30-day expiry meaningfully limits stolen-token lifetime.
- Revocation remains immediate because `revoked_at` is checked before renewal.
- Token rotation can be added later using `session_version` or explicit rotation metadata if there is evidence of token leakage risk that expiry does not cover.

Renewal should be bounded by the policy:
- If the session is revoked, do not renew.
- If the session is already expired, do not renew.
- If the session is valid and the participant presence timestamp is stale, update `last_seen_at` and set `session_expires_at = now + 30 days`.

An optional future hard cap can be considered later, such as requiring rejoin after 180 days even with continuous activity. Do not add that in the first version unless owner controls or compliance requirements demand it.

---

## 9. Implementation phases

### Phase A: schema fields only

Likely files touched:
- `apps/api/src/api/models/roadmap.py`
- `apps/api/alembic/versions/...`
- `docs/backend-api.md`
- `docs/access-model.md`

Validation:
- Inspect generated migration.
- Confirm existing participants receive a non-null or tolerated `session_expires_at`.
- Confirm no auth behavior changes yet.

Rollback:
- Revert migration and model field before enforcement is deployed.
- If already migrated, a down migration can drop `session_expires_at` because it is derived session metadata.

Risk:
- Backfill choice can accidentally expire all existing sessions. Use a grace period, for example `now + 30 days`, for existing rows.

### Phase B: backend expiry enforcement

Likely files touched:
- `apps/api/src/api/services/auth_service.py`
- `apps/api/src/api/services/roadmap_service.py`
- `apps/api/src/api/schemas/roadmap.py` if participant responses expose expiry
- API docs

Validation:
- Valid session succeeds and renews.
- Expired session returns `401` with `"Session expired"`.
- Revoked session returns `401` with `"Session revoked"`.
- Role failures remain `403`.
- Join creates `session_expires_at`.

Rollback:
- Stop checking `session_expires_at` in auth.
- Keep the column; it is harmless metadata if not enforced.

Risk:
- Existing frontend may treat all `401`s the same until Phase C, causing generic "rejoin" UX.

### Phase C: frontend expired-session UX

Likely files touched:
- `apps/web/src/hooks/useRoadmapHydration.ts`
- `apps/web/src/hooks/useRoadmapRealtime.ts`
- `apps/web/src/hooks/useSaveFlow.ts`
- `apps/web/src/components/roadmap/WorkspaceBanners.tsx`
- `apps/web/src/lib/storage.ts` if explicit auth cleanup helpers are useful

Validation:
- Expired auth clears only auth cache.
- Local roadmap cache remains visible.
- Unsaved editor changes survive expiry.
- Rejoin stores a fresh token and keeps the roadmap recoverable.

Rollback:
- Keep backend enforcement and show generic auth-loss messaging.
- Revert UI-specific copy/state changes if they cause regressions.

Risk:
- Confusing expired vs revoked messaging if backend error details are not stable.

### Phase D: owner-facing session metadata

Likely files touched:
- `apps/api/src/api/schemas/roadmap.py`
- `apps/api/src/api/services/roadmap_service.py`
- `apps/web/src/components/roadmap/TeamPanel.tsx`
- `apps/web/src/components/share/ParticipantRow.tsx`
- `docs/backend-api.md`

Validation:
- Participant list shows last seen, revoked state, and expiry clearly.
- Current session remains identifiable.
- Revoked participants remain visible as historical records.

Rollback:
- Hide expiry fields in frontend while keeping backend fields.

Risk:
- Owners may confuse expired sessions with revoked collaborators. Label them separately.

### Phase E: optional token rotation

Likely files touched:
- `apps/api/src/api/models/roadmap.py`
- `apps/api/alembic/versions/...`
- `apps/api/src/api/services/auth_service.py`
- `apps/api/src/api/services/roadmap_service.py`
- `apps/web/src/lib/storage.ts`
- API and access model docs

Validation:
- New token replaces old token safely.
- Old token fails after the intended grace window.
- Local storage updates atomically enough to avoid losing access on network failure.

Rollback:
- Disable rotation while leaving normal expiry enforcement.

Risk:
- Token rotation can strand users if the response is lost before local storage updates. Do not implement until the simpler expiry policy is working.

---

## 10. Manual QA checklist

- Normal join: create a roadmap, copy an editor invite, join in another browser, confirm a participant row is created with role, last seen, and future expiry.
- Session expiry: force a participant `session_expires_at` into the past, refresh the browser, confirm authenticated fetch/save fails as expired and local roadmap content remains.
- Revoked participant: owner revokes an editor, confirm active editor receives access-loss UX via `participant.revoked`, auth cache is cleared, and local roadmap cache remains.
- Revoked share link: owner revokes or rotates an editor link, confirm a new private window cannot join with the old link while existing editor sessions keep working.
- Expired editor with unsaved local edits: make an edit offline or before save, expire the session, attempt save, confirm edits remain in local storage and user is prompted to rejoin.
- Viewer mode: join through the public viewer link, confirm expiry applies to the viewer session and rejoin routes back to `/shared`.
- Owner session: expire the owner session, confirm owner-only share and participant endpoints fail as expired, local copy remains, and owner can regain access only through an active owner invite link.
- Rejoin after expiry: use an active invite link after expiry, confirm a fresh session token is stored and the roadmap can be fetched again.
- Roadmap deleted: delete roadmap as owner, confirm connected participants receive `roadmap.deleted`, auth is cleared, and local cache remains for export or manual recovery.
- Password gate: with password enabled, confirm rejoin after expiry still requires the invite link and correct password.

---

## 11. Risks and non-goals

Risks:
- Short expiry windows could break accountless collaboration by requiring users to find old invite links too often.
- Expiring owner sessions can strand a roadmap if no active owner invite link is available.
- Generic `401` handling can make expired, revoked, and invalid sessions look identical to users.
- Clearing too much browser storage can cause data loss.
- Sliding renewal on every authenticated request can add write load because `last_seen_at` and `session_expires_at` change frequently.
- A public viewer link remains a public read-only access path while active; session expiry does not make that link private.

Non-goals:
- Do not introduce accounts.
- Do not introduce OAuth.
- Do not introduce email verification or password reset.
- Do not introduce complex refresh-token infrastructure unless a later design justifies it.
- Do not silently delete local roadmap data.
- Do not add a global identity model.
- Do not use display names as identity or security proof.
- Do not replace SSE with WebSockets.

Mitigations:
- Use a 30-day sliding lifetime, not a short idle timeout.
- Preserve local caches on every auth-loss path.
- Make expired and revoked responses stable and distinguishable.
- Consider owner-facing warnings if an owner link is inactive and the current owner session is near expiry.
- Renewal writes are throttled so repeated polling does not update `last_seen_at` and `session_expires_at` on every request.

---

## 12. Recommended decision

Implement a simple first version:

- Participant sessions expire after 30 days.
- Successful authenticated activity renews the session to `now + 30 days`.
- Revoked sessions never renew.
- Expired sessions return `401` with `"Session expired"`.
- Revoked sessions return `401` with `"Session revoked"`.
- Share-link rotation or revocation does not kick existing participants.
- Participant revocation immediately kicks existing participants.
- Password changes, if added later, should not automatically kick existing participants unless implemented as a separate explicit owner action.
- Expired and revoked sessions must preserve the local unsynced roadmap copy and ask the user to rejoin or recover/export from local data.
- Do not add refresh tokens or token rotation in the first implementation.

This policy reduces long-lived stolen-session risk while preserving RoadForge's accountless, local-first collaboration model.
