# RoadForge security audit — Phase 1 ledger

Baseline audited: `ff338f664c3d0e5bd6ea867ab65ed75bdeae0516`

This ledger records the first security-hardening phase. It is intentionally
limited to credential transport, share/session authorization, realtime
bootstrap authentication, and at-rest invite handling.

| ID | Severity | Status | Finding |
| --- | --- | --- | --- |
| SEC-001 | High | Fixed in candidate | Role invite bearer credentials were generated in query strings. |
| SEC-002 | High | Fixed in candidate | Single-use SSE credentials were transported in the event-stream query string. |
| SEC-003 | High | Open | 30-day sliding participant bearer tokens persist in browser `localStorage`. |
| SEC-004 | Medium/High | Fixed in candidate | Active viewer invite material was recoverable as plaintext from PostgreSQL/backups. |
| SEC-005 | Medium | Phase 2 | Redis-backed rate limiting fails open if Redis is unavailable. |
| SEC-006 | Medium | Phase 2 | Sensitive API `no-store` handling omits `PATCH`. |
| SEC-007 | Medium | Phase 3 | Security headers have overlapping ownership across app/API/nginx. |
| SEC-008 | Medium | Phase 3 | Compose lacks several compatible runtime hardening controls. |
| SEC-009 | Medium | Phase 4 | GitHub Actions use major-version tags instead of immutable action commit SHAs. |
| SEC-I01 | Informational | Already fixed | Current API image already runs as the unprivileged `roadforge` user. |

## SEC-001

Root cause: generated join URLs used `/join?token=<bearer>`, so the credential
was part of the HTTP request target before application code could redact it.

Fix:
- new links use `/join#token=<bearer>`;
- the browser reads the fragment and removes invite material from the current
  history entry immediately;
- old query links remain accepted only for migration compatibility and are
  scrubbed after the page loads.

Residual risk: a pre-hardening query link still reaches upstream infrastructure
the first time it is used. Operators should rotate owner/editor links after deploying the candidate if
old query URLs may have been distributed. Migration 0011 already revokes
legacy viewer links with recoverable raw material.

## SEC-002

Root cause: the short-lived single-use event ticket was appended to the native
`EventSource` URL because native EventSource cannot attach a Bearer header.

Fix:
- authenticated `POST /events/ticket` stores the 30-second ticket in a
  host-only, path-scoped, `HttpOnly`, `SameSite=Strict` cookie;
- the cookie is `Secure` outside development;
- EventSource connects without query credentials and with credentials enabled;
- the stream still consumes the same single-use roadmap/participant-scoped
  ticket from the existing ticket store.

Residual risk: an attacker who can steal browser cookies inside the 30-second
window could race the legitimate stream; single-use consumption limits replay.

## SEC-003

Root cause: RoadForge's accountless recovery model persists the participant
Bearer credential alongside the local roadmap association.

Disposition: deliberately left open in Phase 1. Moving the token to
`sessionStorage` would silently remove the "return after closing the browser"
owner recovery path. A durable `HttpOnly` session design requires a paired CSRF
and multi-roadmap cookie architecture and belongs in the application-security
phase rather than a superficial storage swap.

## SEC-004

Root cause: viewer share links were intentionally re-copyable, so their raw
bearer token was stored in `share_links.public_token`.

Fix:
- viewer links become reveal-once on create/rotation like owner/editor links;
- ordinary link listing never returns raw invite URLs;
- migration 0011 removes `public_token`;
- migration 0011 first revokes legacy viewer links that had recoverable raw
  material, then drops `public_token`;
- owners rotate the viewer link after upgrade to issue a new reveal-once URL.

Residual risk: historical backups still contain the old raw viewer value, but
the live deployment no longer accepts it after migration. Retain/expire old
backups according to the documented retention policy.
