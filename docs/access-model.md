# RoadForge access model

RoadForge `0.1.0` is accountless. There are no user accounts, global profiles, login
flow, password reset flow, email identity records, or account dashboard.

Access to a synced roadmap is roadmap-scoped and uses invite links, optional roadmap
passwords, and participant sessions.

## Roles

| Role | Current capability |
| --- | --- |
| `owner` | edit roadmap; manage sharing/participants; restore versions; override claims; delete roadmap |
| `editor` | edit roadmap; claim tasks; read collaboration/version information allowed to editors |
| `viewer` | read roadmap, activity, tags, locks, and realtime updates |

The API enforces authorization. Hiding a UI control is not an authorization mechanism.

## Invite links

A newly synced roadmap has role-scoped share-link records for owner, editor, and viewer
access.

Owner/editor/viewer invite tokens:

- are generated with cryptographically random values;
- are stored hashed rather than raw;
- are returned only when initially issued/rotated;
- cannot be recovered from ordinary share-link listing;
- stop authorizing future joins when rotated/revoked.

Generated invite URLs use `/join#token=...`. URL fragments are not included in the HTTP
request target. The browser reads the fragment and removes the credential from the current
history entry. Legacy `?token=` invite links remain accepted only for migration compatibility
and should be rotated after the hardened release is deployed.

The viewer link remains usable as stable read-only sharing/demo access while active, but its
raw token is reveal-once like owner/editor. Migration `0011` revokes legacy viewer links whose
raw token had been persisted and drops the old plaintext `public_token` column. An owner must
rotate the viewer link once after upgrading when a new copyable viewer URL is required.

Invite rotation/revocation controls **future joins**. It does not automatically revoke
participant sessions that already joined through an older link.

## Participant sessions

After roadmap creation or invite exchange, the API issues an opaque roadmap-scoped
participant session.

Non-browser clients such as MCP use the explicit Bearer contract:

```http
Authorization: Bearer <participant-session-token>
```

The RoadForge web client immediately exchanges a newly issued Bearer session for a
path-scoped HttpOnly `roadforge_session` cookie, then stores only a non-secret marker under
the roadmap's auth cache. Pre-hardening raw browser tokens are migrated on the next
successful hydration before the persisted value is replaced.

Browser session cookies are `HttpOnly`, `SameSite=Strict`, `Secure` in production-like
environments, and scoped to `/api/roadmaps/{roadmap_id}`. Cookie-authenticated unsafe
requests also require an exact configured `Origin`. Explicit Bearer requests and ambient
cookie authentication are kept separate.

Participant sessions:

- are stored hashed at rest;
- are roadmap-scoped;
- carry a role through their participant record;
- use a 30-day sliding expiry;
- can be revoked immediately;
- are never placed in normal application URLs;
- must not appear in exports, logs, public issues, task text, or analytics.

The backend validates the session, roadmap scope, revocation/expiry state, and required
role for every protected operation. A stale browser cookie after server-side revocation does
not preserve access because server authorization remains authoritative.

## Display names are labels

Participant display names exist for collaboration UX and activity attribution. They are
not verified identity, are not globally unique, and must not be presented as proof of
who a person is.

Blank names may receive a role-oriented guest label.

## Assignees and participants are different

An **assignee** is portable task planning data. It can exist on a local-only roadmap and
does not grant access.

A **participant** is a server-side joined collaboration session. It has a role and can
be revoked.

RoadForge must not invent participant access from task assignee names or require an
assignee to be a joined participant.

## Optional roadmap password

A synced roadmap may require a password in addition to an invite before a participant
session is issued.

Current server behavior:

- minimum/maximum password constraints are defined by API schema limits;
- the password is stored as a salted PBKDF2-SHA256 hash;
- verification uses a timing-safe comparison;
- join errors do not reveal whether the invite or password was the failing secret.

A roadmap password is not a user account password and has no email recovery mechanism.

## Realtime authorization

RoadForge uses SSE for collaboration updates.

Long-lived participant credentials are not placed in SSE query strings. An authenticated
participant requests a short-lived, single-use event ticket. The API places the ticket in
a path-scoped HttpOnly `roadforge_event_ticket` cookie and EventSource establishes the
stream without putting the ticket in the request URL.

The ticket is roadmap/participant scoped, expires after 30 seconds, and is consumed once.
The event stream remains subject to participant authorization and revocation checks.

## Edit locks and claims

Owner/editor sessions can acquire short-lived soft edit locks. Locks reduce accidental
concurrent editing but are not the source of truth for write authorization or data
integrity. Optimistic concurrency remains the final stale-write protection.

Task claims are collaboration coordination metadata for eligible synced participants and
are distinct from portable task assignees. A participant can release their own claim;
owners may explicitly override according to the current claim contract; task completion
clears an active claim.

## Security boundaries

Accountless access does not mean public access. Operators and contributors must preserve
these rules:

- never log raw invite/session tokens or passwords;
- never add credentials to portable roadmap JSON;
- never put session tokens or SSE tickets in URLs;
- enforce roles in the API on every protected operation;
- keep browser cookie-authenticated writes behind exact-Origin validation;
- preserve local work when server access expires or is revoked;
- require Redis-backed coordination for multi-process realtime deployments;
- treat user-authored imports, labels, descriptions, and links as untrusted input.

## Deliberately absent from `0.1.0`

RoadForge does not currently provide accounts, OAuth/OIDC, email recovery, service accounts,
generic public API keys, billing, or automatic GitHub-to-roadmap mutation. These are not
implied future commitments. Any identity/access-model change requires an explicit
architecture and security decision.

## Known boundaries

- Legacy query invite links remain a migration risk until rotated.
- A newly issued browser session token exists transiently in page JavaScript while it is
  exchanged for the HttpOnly cookie; nonce CSP and normal XSS defenses remain important.
- Pre-hardening raw browser sessions remain in local storage until the first successful
  migration exchange.
- The maintained application/nginx logs omit query strings and credentials, but operators
  must review Cloudflare and other external infrastructure separately.
- Production CSP intentionally retains `style-src 'unsafe-inline'` while dynamic inline
  styles remain part of the UI; executable scripts stay nonce-restricted.
- MCP/API clients intentionally retain Bearer credentials; narrower machine-specific
  credentials remain a separate architecture project.

See [Session Expiry and Revocation Policy](security/session-expiry-and-revocation-policy.md),
[Public Deployment Security](public-deployment-security.md), and
[Security documentation](security/README.md).
