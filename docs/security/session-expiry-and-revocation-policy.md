# RoadForge — Session Expiry and Revocation Policy

Status: implemented security contract for the accountless collaboration model.

RoadForge has no user accounts. Access is roadmap-scoped and is granted by role invite
credentials, an optional roadmap password, and a participant session.

## Session issuance

Roadmap creation issues an owner participant session. Joining an active owner/editor/viewer
invite issues a participant session for that roadmap and role. Raw participant session
tokens are cryptographically random bearer credentials and are stored only as hashes by the
API.

The public API/MCP contract still supports:

```http
Authorization: Bearer <participant-session-token>
```

Browser clients use a different persistence model. Immediately after create/join, the web
client exchanges the one-time raw bearer value through:

```text
POST /api/roadmaps/{roadmap_id}/session/cookie
```

The API sets `roadforge_session` as a path-scoped HttpOnly cookie and the web client keeps
only a non-secret marker in roadmap-scoped browser storage. New raw session tokens therefore
do not enter persistent browser storage.

For pre-hardening browsers, a legacy raw token found in `rf:auth:{roadmapId}` is exchanged
on the next successful server hydration. Only after that exchange succeeds is the persisted
raw value replaced with the non-secret cookie-session marker. This preserves local-first and
no-account recovery when the API is temporarily unavailable during migration.

## Browser cookie contract

`roadforge_session` is:

- `HttpOnly`;
- `SameSite=Strict`;
- `Secure` in production-like environments;
- scoped to `/api/roadmaps/{roadmap_id}`;
- aligned to the participant session's 30-day sliding lifetime.

The browser includes the cookie only for cookie-authenticated roadmap requests. Explicit
Bearer requests are deliberately kept separate from ambient cookie authentication.

Cookie-authenticated `POST`, `PUT`, `PATCH`, and `DELETE` requests must include an `Origin`
that exactly matches a configured `ROADFORGE_CORS_ORIGINS` entry. Otherwise the API returns
`403`. This is a defense-in-depth CSRF requirement in addition to `SameSite=Strict`.

The canonical RoadForge deployment serves the web and API under the same public site. A
cross-site deployment requires an explicit architecture/security review rather than
relaxing the cookie or Origin policy ad hoc.

## Expiry and renewal

Participant sessions use a 30-day sliding expiry.

- New sessions set `session_expires_at` to `now + 30 days`.
- A valid authenticated request may update `last_seen_at` and renew the expiry according to
  the central presence/renewal policy.
- An already expired session does not renew.
- A revoked session does not renew.
- Owners, editors, and viewers use the same initial lifetime; role is an authorization
  property, not an expiry class.

Expired authentication returns `401` with `Session expired`. Revoked authentication returns
`401` with `Session revoked`. A missing/unknown credential remains `401` with `Missing or
invalid session token`. A valid session with the wrong role remains `403`.

A browser cookie may physically remain in the browser until its cookie lifetime ends after a
server-side revocation. That is not an authorization bypass: every protected operation
revalidates the participant, roadmap scope, role, expiry, and revocation state against
server-authoritative data.

## Revocation boundaries

Invite-link rotation or revocation prevents **future joins** with that invite. It does not
kick participants that already exchanged it for sessions.

Participant revocation invalidates that participant's existing session on every protected
API path and broadcasts `participant.revoked` to active realtime connections.

Roadmap deletion deactivates active invite links, makes participant sessions unusable for
the deleted roadmap, and broadcasts `roadmap.deleted`.

These controls are intentionally separate so an owner can rotate a leaked invite without
unexpectedly disconnecting legitimate active collaborators.

## Realtime credentials

Long-lived participant credentials never belong in an EventSource URL.

An authenticated participant first requests:

```text
POST /api/roadmaps/{roadmap_id}/events/ticket
```

The API creates a cryptographically random ticket scoped to the roadmap and participant,
with a 30-second lifetime and single-use consumption. It transports the ticket only in the
path-scoped HttpOnly `roadforge_event_ticket` cookie. `GET .../events` consumes the ticket
and expires the browser ticket cookie; the EventSource URL contains no credential.

Revocation is still authoritative after stream establishment through the existing realtime
revocation checks and broadcasts.

## Local-first failure behavior

Loss of server authorization must not delete local roadmap work.

When a session expires, is revoked, or becomes invalid:

- remove the scoped auth state;
- stop treating the browser as authenticated;
- preserve `rf:roadmap:{roadmapId}`;
- preserve unsynced edits and mark them local/unsaved as appropriate;
- require a fresh valid invite to regain server access;
- reconcile through existing optimistic-concurrency/conflict handling rather than silently
  overwriting either side.

Participant display names remain collaboration labels, not verified identity.

## Storage and incident rules

Never place raw invite/session credentials in portable roadmap exports, task text, logs,
analytics, public issues, release evidence, or normal application URLs.

New generated invite links use `/join#token=...`; fragments are not sent in the HTTP request
target, and the join page removes the credential from the current browser history entry
after reading it. Legacy `?token=` links are accepted only for migration compatibility and
should be rotated after deployment.

For browser incident response, revoke the affected participant session. For leaked invite
links, rotate/revoke the affected role link; revoke joined participants separately when
needed.

## Residual boundaries

- The raw participant token exists transiently in JavaScript memory while the create/join
  response is exchanged for the HttpOnly cookie. CSP and normal XSS defenses therefore
  remain important.
- Pre-hardening raw browser sessions remain in local storage until their first successful
  migration exchange.
- Automatic participant-token rotation and a hard lifetime cap beyond the current sliding
  policy are not implemented.
- MCP/API clients intentionally retain explicit Bearer credentials because HttpOnly browser
  cookies are not an appropriate non-browser client contract.

Any change that relaxes `HttpOnly`, `SameSite=Strict`, cookie path scoping, exact-Origin
checks, or server-authoritative participant validation requires a new security review.
