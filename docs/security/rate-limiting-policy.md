# Rate Limiting Policy

Status: implemented baseline with retained design rationale for RF-826.

Related policy: [Session Expiry And Revocation Policy](./session-expiry-and-revocation-policy.md).

## 1. Current exposure

RoadForge uses accountless collaboration. There are no accounts, OAuth identities, email addresses, or global user identities to rate-limit against. The current backend accepts role-scoped invite tokens, optional roadmap passwords, and participant session tokens.

Sensitive public or semi-public endpoints:

- `POST /api/roadmaps/join` accepts a raw invite token and optional password. It creates a participant and returns a raw session token. This is the highest-priority endpoint because it combines invite-token validation, password verification, participant creation, and session-token issuance.
- Optional roadmap password verification currently happens inside the join flow. Password-protected roadmaps return `"Invalid invite token or password"` for missing or wrong passwords.
- Share-link tokens are bearer credentials. Owner/editor raw tokens are returned only on create/rotate, while viewer tokens may be persisted as public read-only demo links. Join attempts use token hashes for lookup.
- `POST /api/roadmaps` creates a roadmap, owner participant, three share links, activity log rows, and an owner session token. It is public and can be abused for spam or storage growth.
- `POST /api/roadmaps/{roadmap_id}/events/ticket` issues short-lived SSE tickets for any valid participant session. Repeated calls can create unnecessary ticket churn and event connection attempts.
- Owner share management endpoints are authenticated but sensitive: `GET /api/roadmaps/{roadmap_id}/share-links`, `POST /api/roadmaps/{roadmap_id}/share-links/{role}/rotate`, and `DELETE /api/roadmaps/{roadmap_id}/share-links/{role}`. Rotate exposes a new raw invite URL.
- Participant revocation, roadmap delete, version restore/checkpoint, update,
  lock, and activity endpoints are Bearer-session protected and have
  action-specific participant limits.

Access categories:

- Public invite-token access: `POST /api/roadmaps/join` has no `Authorization` header requirement. The raw invite token and optional password are the only proof of access.
- Public creation access: `POST /api/roadmaps` has no `Authorization` header requirement and creates owner access.
- Authenticated Bearer-session access: roadmap read/write, event-ticket, share-link management, participant management, version, lock, and activity endpoints use `Authorization: Bearer <session_token>` and `require_participant`.

## 2. Security goals

- Preserve accountless collaboration and role-scoped invite links.
- Reduce brute force against invite tokens and roadmap passwords.
- Reduce automated abuse of roadmap creation and join attempts.
- Avoid blocking normal collaboration, including several collaborators joining from the same office or home network.
- Avoid relying on accounts, email identity, OAuth, or global identity.
- Keep local-first browser storage behavior unchanged.
- Keep limits understandable enough to implement, operate, and tune without a separate abuse platform.

## 3. Threat model

Brute-force invite token attempts:

Attackers may submit guessed invite tokens to `POST /api/roadmaps/join`. Tokens are high entropy, but unbounded attempts still create database load and can discover valid tokens if token generation or storage is ever weakened.

Password guessing:

For a valid invite token to a password-protected roadmap, attackers may repeatedly guess the roadmap password. Limits must slow guesses by client IP and by share-link or roadmap identity after the token is known valid.

Spam roadmap creation:

Automated clients may repeatedly call `POST /api/roadmaps` to fill the database with roadmaps, share links, participants, versions, and activity logs.

Repeated event-ticket requests:

Valid participant sessions can repeatedly request SSE tickets. Tickets are short-lived, but excessive issuance can waste memory and service time.

Participant/session token abuse:

A stolen or leaked session token can call authenticated endpoints until it expires or is revoked. Rate limiting does not replace RF-825 session expiry and revocation, but can reduce noisy abuse from a single token.

Owner share-link rotate/revoke abuse:

A valid owner session can rapidly rotate or revoke share links, disrupting collaborators and producing repeated raw-token exposure on rotate responses. This is authenticated abuse, so limits should be higher than public join limits but still action-specific.

Denial-of-service considerations:

Application-level rate limiting is not a full DoS defense. It should reduce database and service work for obvious abuse. Large volumetric attacks still need edge controls at Cloudflare, Nginx, hosting firewalls, or the platform network layer.

## 4. Rate-limit dimensions

Recommended dimensions:

- Client IP: primary dimension for public creation and unknown-token join attempts. It works without accounts, but can group NATed collaborators together.
- Invite token identity: for valid invite tokens, key by the stored `ShareLink.id`, `token_hash`, or a server-derived hash of the submitted raw token. Prefer internal identifiers after lookup; avoid storing raw tokens in limiter keys or logs.
- Token prefix: useful only as a coarse signal before lookup. It is non-secret and not unique enough to be the only key.
- Roadmap ID: useful for password failures, event-ticket requests, and owner share actions once the roadmap is known.
- Participant/session token: for authenticated endpoints, key by participant ID or session-token hash after authentication, not by raw Bearer token.
- Endpoint/action type: keep independent buckets for join, failed password, roadmap create, event ticket, share rotate, share revoke, and optional global fallback.

Display names should not be a rate-limit dimension. Display names are optional, user-controlled, non-unique, and intentionally not identity. They may be blank or repeated across legitimate collaborators.

Do not key limits by roadmap name, owner display name, task assignees, or local browser storage identifiers. Those values are not stable server-side identity.

## 5. Recommended first-version limits

These defaults are proposed starting points and should be tuned after manual QA and production observation. They intentionally favor preserving normal collaboration while slowing automation.

| Action | Primary key | Proposed limit | Rationale |
| --- | --- | ---: | --- |
| Join attempts | client IP | 20 per minute | Allows several collaborators or retries behind one NAT, but slows token scanning. |
| Join attempts | invite/share-link identity when token resolves | 30 per 10 minutes | Slows repeated use of one exposed link without blocking a normal meeting. |
| Failed password attempts | client IP + roadmap ID or share-link ID | 5 per 10 minutes | Password guessing is the main risk after a valid invite token is known. |
| Failed password attempts | roadmap ID or share-link ID | 30 per hour | Adds a shared backstop when guesses come from many IPs. |
| Roadmap creation | client IP | 10 per hour | Normal users rarely create many roadmaps quickly; this reduces spam growth. |
| Event ticket requests | participant ID + roadmap ID | 10 per minute | Allows refresh/reconnect loops while limiting excessive ticket churn. |
| Event ticket requests | client IP + roadmap ID | 60 per minute | Backstops many sessions or repeated clients from one network. |
| Share-link rotate | owner participant ID + roadmap ID + role | 5 per minute | Rotation is user-triggered and sensitive; rapid loops are likely accidental or abusive. |
| Share-link revoke | owner participant ID + roadmap ID + role | 10 per minute | Revocation should remain responsive but does not need high frequency. |
| Global fallback | client IP | 300 requests per minute | Catches simple floods without trying to classify every route. |

Join and password limits should be evaluated before expensive work where practical. For unknown invite tokens, only the client IP and submitted-token hash/prefix are available before lookup. For valid invite tokens, apply the share-link and roadmap-specific buckets after lookup and before password verification or participant creation.

Successful password-protected joins may clear or soften only the password-failure bucket for that client and share link. They should not clear broad IP or global buckets.

## 6. Backend implementation approach

Recommended placement for the first implementation:

- Add an app-level FastAPI limiter helper or dependency in the API app.
- Apply it from route handlers or small per-route dependencies for sensitive actions.
- Keep route/action-specific names so limits are explicit at call sites.
- Keep reverse-proxy and Cloudflare limits as optional outer protection, not the only enforcement.

Current deployment evidence supports an in-process first version: the hosting notes require one Uvicorn worker because the lock service, SSE event bus, and ticket service are process-local singletons. In that deployment shape, an in-memory limiter has predictable behavior and no new infrastructure requirement.

Suggested code shape for a later implementation:

- `apps/api/src/api/services/rate_limit_service.py` or `apps/api/src/api/middleware/rate_limit.py` for bucket logic.
- Small route helpers in `apps/api/src/api/routers/roadmaps.py` for action-specific keys.
- Optional settings in `apps/api/src/api/config.py` only if the first implementation needs environment-specific overrides.
- Tests or manual validation focused on `POST /api/roadmaps/join`, password failures, `POST /api/roadmaps`, event tickets, and owner share actions.

Reverse proxy, Cloudflare, and Nginx:

- They are useful for volumetric and coarse IP controls.
- They cannot safely key by participant ID, share-link identity, or password-failure result unless the backend exposes that information, which it should not.
- They should not be required for local development or correctness of app-level security behavior.

When RF-822 Redis exists, move shared counters to Redis so multiple workers or instances share limits. Keep the same action names and key strategy so the migration changes storage, not product behavior.

## 7. Storage strategy

In-memory limiter:

- Best first implementation for the current single-node, single-worker API.
- No new service dependency.
- Fast and easy to remove or tune.
- Counters reset on process restart, which is acceptable for a first protective layer.
- Not correct across multiple workers or multiple API instances.

Redis-backed limiter:

- Preferred future storage after RF-822 introduces Redis.
- Supports atomic increments with TTL across workers and instances.
- Better for production scaling and consistent enforcement.
- Adds operational dependency and failure-mode decisions.
- Current RF-885 behavior uses Redis fixed-window counters only when
  `ROADFORGE_REALTIME_BACKEND=redis`; Redis check failures fail open with a
  warning that logs the action name, not raw limiter keys.

Database-backed counters:

- Durable and shared, but inappropriate as the first choice.
- Adds write load to the database during abusive traffic.
- Requires cleanup jobs or TTL-like maintenance.
- Risks turning rate limiting into the same resource pressure it is meant to reduce.

Recommendation: implement an in-memory limiter first, then replace the storage adapter with Redis after RF-822. Do not introduce database counters for RF-826 unless future requirements need audit-grade persistence.

## 8. Error response behavior

Rate-limited requests should return:

- HTTP status: `429 Too Many Requests`.
- Body shape compatible with existing FastAPI errors, for example `{ "detail": "Too many requests. Try again later." }`.
- `Retry-After` header in seconds, rounded up to the remaining bucket cooldown.
- No indication of whether an invite token exists, whether a roadmap exists, or whether a password was close or wrong.

Frontend messaging should be simple and non-specific:

- Join/password: "Too many attempts. Wait a moment and try again."
- Roadmap create: "Too many roadmap saves from this network. Try again later."
- Event ticket/realtime: fall back to reconnect delay messaging without exposing limiter internals.
- Share actions: "Too many share-link changes. Wait a moment and try again."

Logging:

- Log rate-limit hits at info or warning level with action name, non-secret limiter key fingerprints, retry-after seconds, and request path.
- Do not log raw invite tokens, raw session tokens, passwords, full join URLs, or Authorization headers.
- Consider sampling repeated hits from the same bucket if logs become noisy.

## 9. Privacy and proxy/IP handling

Client IP is useful but must be handled carefully.

- In local development, use `request.client.host`.
- In production behind Nginx and Cloudflare Tunnel, the app may see the proxy address unless trusted proxy headers are configured.
- `X-Forwarded-For`, `X-Real-IP`, and `CF-Connecting-IP` must not be blindly trusted from arbitrary clients. A direct client can spoof those headers if the app trusts them without checking the immediate peer.
- Only use forwarded headers when the request comes from a configured trusted proxy or when the deployment guarantees the API is not directly reachable except through that proxy.
- Document the trusted proxy chain for the deployment before enabling forwarded-header based IP extraction.

Current deploy config sets `X-Real-IP` and `X-Forwarded-For` in Nginx, and Cloudflare Tunnel feeds central Nginx. The first implementation should either:

- keep local behavior using `request.client.host` and document that production IP quality is proxy-dependent, or
- add explicit trusted-proxy settings before using forwarded headers.

Do not store full IP addresses in long-lived database tables for RF-826. In-memory and Redis TTL counters are enough for the proposed limits.

## 10. Interaction with session expiry policy

RF-825 defines 30-day sliding participant sessions, expired-session rejoin through active invite links, revoked-session non-renewal, share-link revoke/rotate blocking future joins only, participant revoke kicking existing sessions, and preserving local roadmap cache.

Rate limiting should support that policy:

- Expired sessions should fail session authentication normally and must not be counted as password failures.
- Rejoining with an active invite link after session expiry is a normal flow and should be allowed within join limits.
- Revoked sessions should not renew. Attempts using revoked sessions may count against authenticated-action or invalid-session buckets later, but not against password buckets.
- Share-link revoke/rotate still affects future joins only. The limiter must not clear local cache or delete participant state.
- Participant revoke remains separate from rate limiting. A revoked participant who uses a still-active invite link to rejoin is subject to normal join and password limits.

## 11. Implementation phases

Phase A: document policy and identify endpoints

- Likely files touched: `docs/security/rate-limiting-policy.md`; optionally `docs/security/README.md` or `docs/backend-api.md` for links.
- Validation: documentation review against current routes and RF-825.
- Rollback: remove or amend the document.
- Risk: low; no runtime behavior change.

Phase B: app-level in-memory limiter helper

- Likely files touched: `apps/api/src/api/services/rate_limit_service.py`, `apps/api/src/api/schemas/common.py` if a shared error helper is needed, and focused tests if test coverage exists for API routes.
- Validation: unit tests for bucket TTL, `Retry-After`, independent action buckets, and reset after cooldown; manual smoke test that unrelated routes still respond.
- Rollback: remove helper and route dependencies before release, or disable through config if a feature flag is added.
- Risk: clock/TTL mistakes, accidental shared buckets, memory growth if keys are not expired.

Phase C: apply to join/password and roadmap creation

- Likely files touched: `apps/api/src/api/routers/roadmaps.py`, `apps/api/src/api/services/roadmap_service.py` only if join needs to report password-failure outcomes to the limiter, and docs/API notes.
- Validation: normal join succeeds, repeated bad tokens hit join IP limit, repeated wrong password hits password limit, successful join after cooldown, roadmap creation throttles per IP.
- Rollback: remove route-level limiter calls for these endpoints.
- Risk: blocking legitimate collaborators behind NAT, revealing valid-token state through timing or different limiter behavior.

Phase D: apply to event-ticket and sensitive owner actions

- Likely files touched: `apps/api/src/api/routers/roadmaps.py`; possibly auth helper plumbing if participant ID should be passed into limiter keys consistently.
- Validation: event reconnects still work, repeated ticket calls return 429, share rotate/revoke remains usable and throttles tight loops.
- Rollback: remove limiter calls from event-ticket and share-action routes.
- Risk: over-throttling reconnect behavior during flaky networks or making owner recovery actions feel broken.

Phase E: add Redis-backed limiter later with RF-822

- Likely files touched: limiter service storage adapter, API config, dependency wiring, deployment docs, and Redis-related tests.
- Validation: counters are shared across workers, TTLs expire, Redis outage behavior is explicit, and existing in-memory tests still pass through the same interface.
- Rollback: switch limiter storage back to in-memory for single-worker deployments.
- Risk: Redis dependency outage, inconsistent config across environments, accidental key persistence beyond intended TTL.

## 12. Manual QA checklist

- Normal create and join flow is not blocked for owner, editor, and viewer roles.
- Several collaborators can join from the same IP within a short period.
- Repeated wrong passwords on a password-protected roadmap eventually return `429`.
- Correct password works after the cooldown expires.
- Invalid invite-token guessing eventually returns `429` without revealing whether any token exists.
- Roadmap creation from one IP is throttled after the configured burst.
- Event-ticket endpoint allows normal page load, refresh, and reconnect, then throttles repeated direct calls.
- Owner can rotate and revoke share links normally, but rapid repeated rotate/revoke calls return `429`.
- Revoked share links still return the existing invalid-token behavior unless the rate limit is hit first.
- Expired sessions are handled by session auth and do not count as password failures.
- Local development works with `request.client.host`.
- Production proxy behavior is reviewed with the configured Nginx and Cloudflare Tunnel path before trusting forwarded headers.
- Rate-limit logs do not contain raw invite tokens, passwords, raw session tokens, Authorization headers, or full join URLs.

## 13. Risks and non-goals

Non-goals for the first version:

- Do not introduce accounts.
- Do not introduce OAuth.
- Do not introduce email verification.
- Do not introduce global identity.
- Do not introduce WebSockets.
- Do not require Redis before RF-822.
- Do not require CAPTCHA in the first version unless real abuse shows the simple limiter is insufficient.
- Do not use display name as identity.
- Do not store raw invite tokens, raw session tokens, passwords, or full join URLs in limiter keys or logs.

Main risks:

- IP-based limits can affect multiple legitimate collaborators behind one NAT.
- In-memory counters reset on restart and are isolated to one process.
- Forwarded IP headers can be spoofed if trusted without a controlled proxy chain.
- Per-token or per-roadmap limits must avoid revealing that a guessed token is valid.
- Overly strict event-ticket limits can make realtime reconnect behavior feel unreliable.

## 14. Recommended decision

Implement RF-826 as a simple app-level limiter first:

- Use in-memory TTL buckets for the current single-node, single-worker API.
- Apply route/action-specific limits instead of one broad limit.
- Key public join attempts by client IP before lookup.
- After a token resolves, also key join limits by share-link identity and failed password limits by client IP plus share-link or roadmap identity.
- Key authenticated event-ticket and owner share-action limits by participant ID, roadmap ID, role where relevant, and action type.
- Return `429` with a generic FastAPI-style error body and `Retry-After`.
- Preserve accountless collaboration, invite-link semantics, RF-825 session behavior, and local-first browser storage.
- Move limiter storage to Redis when RF-822 exists and the API can safely run with shared counters across workers or instances.
