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

The viewer link is intentionally usable as stable read-only sharing/demo access while
active. Its raw token is reveal-once on create/rotation like the other roles and is
not persisted for later recovery; rotate it when a copyable URL is needed again.

Invite rotation/revocation controls **future joins**. It does not automatically revoke
participant sessions that already joined through an older link.

## Participant sessions

After roadmap creation or invite exchange, the client receives an opaque session token.
The browser stores it in scoped local storage and sends:

```http
Authorization: Bearer sess_<token>
```

Session tokens:

- are stored hashed at rest;
- are roadmap-scoped;
- carry a role through their participant record;
- can expire or be revoked;
- are never placed in normal application URLs;
- must not appear in exports, logs, public issues, task text, or analytics.

The backend validates the session, roadmap scope, revocation/expiry state, and required
role for every protected operation.

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

Long-lived participant session tokens are not placed in SSE query strings. An
authenticated participant first requests a short-lived single-use event ticket. The
API places it in a path-scoped HttpOnly cookie and EventSource establishes the stream
without putting the ticket in the request URL.

The event stream remains subject to participant authorization/revocation checks.

## Edit locks

Owner/editor sessions can acquire short-lived soft edit locks. Locks reduce accidental
concurrent editing but are not the source of truth for write authorization or data
integrity.

Optimistic concurrency remains the final stale-write protection.

## Claims

Task claims are collaboration coordination metadata for eligible synced participants.
They are distinct from portable task assignees.

- a participant can release their own claim;
- owners may explicitly override according to the current claim contract;
- task completion clears the active claim;
- claims do not become portable identity credentials.

## Security boundaries

Accountless access does not mean public access.

Operators and contributors must preserve these rules:

- never log raw invite/session tokens or passwords;
- never add credentials to portable roadmap JSON;
- never put session tokens in URLs;
- enforce roles in the API;
- preserve local work when server access expires or is revoked;
- require Redis-backed coordination for multi-process realtime deployments;
- treat user-authored imports/Markdown/links as untrusted input.

## Deliberately absent from `0.1.0`

RoadForge does not currently provide:

- accounts or email identity;
- OAuth/OIDC login;
- email verification/recovery;
- service accounts or generic public API keys;
- billing/subscriptions;
- automatic GitHub-to-roadmap state mutation.

These are not implied future commitments. Any change to the identity/access model
requires an explicit architecture/security decision before implementation.

## Known boundaries

- New invite URLs carry credentials in fragments and the join page scrubs them from the current history entry; legacy query links remain a migration risk until rotated.
- The maintained application/nginx log formats omit query strings, but operators must review external infrastructure separately.
- Browser participant session credentials still live in local storage; replacing this safely requires a paired durable-cookie/CSRF design.
- Production CSP uses nonce-based enforcement; deployment evidence still belongs in the operational proof gate.
- Server retention/purge tooling is implemented, but operators still need to schedule and observe it.

See [Public deployment security](public-deployment-security.md) and
[Security documentation](security/README.md) for deployment controls.
