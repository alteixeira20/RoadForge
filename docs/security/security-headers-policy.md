# Security Headers Policy

Status: baseline implemented. Next.js emits report-only CSP and baseline browser
headers; FastAPI emits API security/cache headers. CSP enforcement remains deferred.

Related policies:

- [Session Expiry and Revocation Policy](./session-expiry-and-revocation-policy.md)
- [Rate Limiting Policy](./rate-limiting-policy.md)

RoadForge is accountless. Access is controlled by role-scoped invite links, optional roadmap passwords, and participant session tokens stored in browser storage. A strict security headers policy should reduce browser-side attack surface without changing that collaboration model.

## 1. Current exposure

Security headers may be applied in four places:

- The Next.js frontend can set response headers from `apps/web/next.config.ts`.
- The FastAPI API can set API response headers from middleware.
- The reverse proxy can set or override headers before responses reach browsers.
- Cloudflare may add, remove, or override edge behavior depending on zone settings, Tunnel routing, and caching configuration.

Current repository evidence:

- `apps/web/next.config.ts` sets `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a
  restrictive `Permissions-Policy`, and `Content-Security-Policy-Report-Only`.
- `deploy/self-hosted/nginx/roadforge.conf` sets the same baseline headers at the Nginx layer and proxies `/api/` to FastAPI and everything else to Next.js.
- `apps/api/src/api/main.py` wires CORS, body-size, and security-header middleware.
  Sensitive roadmap JSON receives `Cache-Control: no-store`; API responses receive
  `X-Content-Type-Options: nosniff`, while SSE retains stream-safe headers.
- `apps/api/src/api/middleware/cors.py` allows configured origins, credentials, all methods, and all headers.
- The hosted deployment path is documented as Cloudflare Tunnel -> central Nginx -> Docker `edge` network. Cloudflare should be treated as an outer layer, not the only place headers exist, because self-hosted deployments can bypass Cloudflare entirely.

Browser storage is sensitive in this app. Roadmap content is cached locally under `rf:roadmap:{roadmapId}`. Participant bearer credentials are stored under `rf:auth:{roadmapId}` and sent as `Authorization: Bearer <session_token>` on protected API calls. The active roadmap ID is stored in `sessionStorage`. A successful XSS can read local roadmap data, read bearer tokens, call protected APIs as the participant, and open SSE tickets. CSP cannot make XSS harmless, but it can reduce the blast radius and make some injection paths fail.

SSE is part of the current runtime model. The frontend obtains a short-lived ticket with a Bearer-authenticated API call and opens `EventSource` to `/api/roadmaps/{id}/events?ticket=...`. Any CSP must allow the configured API origin in `connect-src`; otherwise normal realtime collaboration breaks.

## 2. Security goals

- Reduce XSS blast radius, especially against participant session tokens in `localStorage`.
- Reduce clickjacking by preventing untrusted framing.
- Reduce MIME sniffing and content-type confusion.
- Control cross-origin connections so injected code cannot freely exfiltrate data.
- Preserve API calls, SSE/EventSource, Next.js static assets, fonts, images, favicons, the web manifest, and local development.
- Avoid breaking Next.js runtime behavior, hydration, font loading, or development HMR.
- Preserve accountless collaboration, invite links, optional roadmap passwords, and local-first cache behavior.
- Keep the first implementation small, observable, and reversible.

## 3. Recommended headers

| Header | Recommended value | Apply at | Risk and compatibility notes |
| --- | --- | --- | --- |
| `Content-Security-Policy-Report-Only` | Start with the staged policy in section 4. | Prefer Next.js for frontend routes first; proxy may add it for all HTML responses. | Report-only must come before enforcement. Include the API origin in `connect-src` for fetch and SSE. Do not enforce a brittle policy until reports and manual QA confirm runtime needs. |
| `Content-Security-Policy` | Enforce the same staged policy after observation. | Frontend HTML responses; proxy may enforce consistently for self-hosted production. | Enforcement can break Next.js hydration, fonts, inline styles/scripts, images, EventSource, import/export UI, and local dev if applied too early. |
| `X-Frame-Options` | `DENY` while the product has no embedding requirement. | Frontend and proxy. | Current Next.js and Nginx already set `DENY`. CSP `frame-ancestors` is the modern control and should be the source of truth once CSP is enforced. |
| `frame-ancestors` | Prefer `frame-ancestors 'none'`; use `'self'` only if same-origin embedding becomes a product requirement. | CSP on frontend HTML responses and proxy-managed HTML responses. | `frame-ancestors` does not use `default-src`. It replaces the need for `X-Frame-Options` in modern browsers, but keeping both during rollout is acceptable if values agree. |
| `X-Content-Type-Options` | `nosniff` | Frontend, API, and proxy. | Low risk. Already set by Next.js and Nginx. API should add it if the API can be reached without the proxy. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Frontend and proxy; API optional. | Current value is a good default. It avoids leaking full invite-token URLs cross-origin while preserving useful same-origin referrers. `no-referrer` is stricter but can make diagnostics harder. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()` | Frontend and proxy. | Current value matches RoadForge's needs. Add features only when a product feature requires them. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` after HTTPS is stable. Add `preload` only after deliberate preload review. | TLS-terminating reverse proxy or Cloudflare edge, not local dev. | Do not send HSTS on localhost or plain HTTP. HSTS belongs where HTTPS is guaranteed. Misconfiguration can break subdomains. |
| `Cross-Origin-Opener-Policy` | Start with `same-origin-allow-popups`; consider `same-origin` later if no workflow needs cross-origin popups. | Frontend HTML responses. | RoadForge does not currently appear to need OAuth popups. `same-origin` is stricter but can affect integrations and popup flows if added later. |
| `Cross-Origin-Resource-Policy` | `same-origin` for HTML and API JSON where practical; `cross-origin` or omit for static assets that must be embeddable elsewhere. | Frontend/proxy for HTML and API; be careful with static assets. | `same-origin` can break cross-origin loading of shared assets or public images if those become product requirements. It should not block same-origin Next.js assets. |
| `Cache-Control` | Auth-sensitive API responses: `no-store`. Static Next.js assets: keep framework defaults. SSE: `no-cache`/stream-friendly behavior. | API for JSON/SSE; proxy may reinforce. | Do not mark the whole site `no-store`; it hurts static asset caching. API responses that include session tokens, invite URLs, participants, roadmap data, or activity logs should not be cached by shared proxies. |

Recommended first baseline:

- Keep the existing conservative headers in Next.js and Nginx.
- Add CSP in report-only mode first.
- Add API `nosniff` and `Cache-Control` for sensitive API responses if the API can be accessed directly.
- Add HSTS only at HTTPS termination.
- Keep `X-Frame-Options: DENY` aligned with `frame-ancestors 'none'` until CSP enforcement is stable.

## 4. CSP policy design

Use a staged CSP. The first shipped policy should be report-only in production-like environments, then enforced after manual QA and report review.

Production report-only starting point:

```text
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' https://<api-origin>;
manifest-src 'self';
worker-src 'self' blob:;
upgrade-insecure-requests;
```

Replace `https://<api-origin>` with the deployed `NEXT_PUBLIC_API_URL` origin. If the API and frontend share the same public origin, `'self'` covers API fetches and SSE. If the API uses a separate host or port, that origin must be listed explicitly in `connect-src`.

Development report-only starting point:

```text
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self' 'unsafe-eval' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' http://localhost:7878 http://127.0.0.1:7878 ws://localhost:* ws://127.0.0.1:*;
manifest-src 'self';
worker-src 'self' blob:;
```

Development needs are intentionally looser. Next.js development can require `unsafe-eval`, runtime style injection, and websocket connections for HMR. Those allowances should not be copied into production enforcement unless observation proves they are required.

Directive notes:

- `connect-src` must allow the API origin used by `NEXT_PUBLIC_API_URL`. EventSource uses the same directive as fetch, so this covers `/api/roadmaps/{id}/events`.
- `img-src 'self' data: blob:` matches the current local image footprint: favicons, app icons, brand images, and possible browser-generated blobs. Remove `blob:` later if import/export previews or generated image URLs do not need it.
- `font-src 'self'` matches current `next/font/google` usage because Next.js self-hosts the selected Lexend and JetBrains Mono font files under `/_next/static/media`. If the app later loads fonts from a CDN, this directive must be updated deliberately.
- `style-src 'self' 'unsafe-inline'` is a pragmatic first value for Next.js. Inline styles may appear from framework/runtime behavior, next/font, or component-level style attributes. `unsafe-inline` weakens XSS protection, so the long-term goal should be nonce or hash-based styles if Next.js usage allows it without brittle maintenance.
- `script-src 'self'` is the production goal. Do not add `unsafe-eval` in production unless a measured Next.js production build violation proves it is required. Do not add broad third-party script hosts without a product need.
- Avoid `unsafe-inline` for production scripts if possible. If Next.js inline bootstrap scripts require it, prefer a nonce-based implementation following Next.js guidance over permanent `script-src 'unsafe-inline'`.
- `object-src 'none'` blocks legacy plugin content and should be enforced.
- `base-uri 'self'` reduces base-tag injection risk.
- `form-action 'self'` is compatible with the app because forms are handled by the frontend and API calls use fetch.
- `frame-ancestors 'none'` should be the first choice because RoadForge does not currently require embedding. Use `'self'` only if same-origin embedding becomes an explicit product requirement.
- `upgrade-insecure-requests` is production-only. Do not use it for localhost HTTP development.

Report collection can start without a custom endpoint by watching browser console violations during QA. A later implementation can add a dedicated report endpoint or use proxy/edge logging, but it must avoid logging raw invite tokens, session tokens, Authorization headers, full join URLs, and passwords.

## 5. API-specific headers

FastAPI should eventually set headers that protect API responses even when the API is reached without the production proxy:

- `X-Content-Type-Options: nosniff` on all API responses.
- `Cache-Control: no-store` on responses containing roadmap data, participant data, activity logs, share links, session tokens, invite URLs, or auth errors that might include sensitive context.
- SSE responses should remain stream-friendly. Use no shared proxy caching and preserve existing Nginx behavior: buffering off, proxy cache off, long read/send timeouts.
- `Referrer-Policy` and `Permissions-Policy` can be set at proxy/frontend level. They do little for JSON clients but are harmless if consistent.
- CSP is primarily a browser document policy. It should be attached to frontend HTML responses. Adding CSP to JSON API responses is usually unnecessary and can create misleading duplication.
- HSTS should not be set by FastAPI unless it is directly responsible for HTTPS. In the documented deployment, TLS terminates before the app.

CORS interaction:

- CORS decides which browser origins may read API responses. CSP decides which origins the frontend page may connect to.
- Both must allow the same intended API origin in production, but they are not substitutes.
- Current API CORS uses configured origins and credentials. Keep it explicit; do not use wildcard origins with credentialed requests.
- The `Authorization` header is required for protected API calls and must remain allowed by CORS.
- EventSource to a separate API origin is still governed by CORS and `connect-src`.

## 6. Reverse proxy / Cloudflare strategy

Next.js app:

- Own frontend HTML CSP policy and report-only rollout when possible.
- Continue setting `nosniff`, clickjacking, referrer, and permissions headers for frontend routes.
- Keep policy generation aware of `NEXT_PUBLIC_API_URL` so `connect-src` matches the deployed API/SSE origin.

FastAPI app:

- Own API-specific `nosniff` and sensitive-response cache headers if the API may be exposed directly.
- Preserve CORS as the API's browser-origin access control.
- Preserve SSE behavior and do not add response buffering or caching.

Nginx/reverse proxy:

- Own HTTPS-adjacent deployment controls where it terminates public traffic, including HSTS when HTTPS is stable.
- Reinforce shared baseline headers for both frontend and API when self-hosting.
- Keep SSE location buffering and caching disabled.
- Avoid duplicating CSP with conflicting values. If both Next.js and Nginx emit CSP, browsers enforce both, and the effective policy becomes the intersection. That can cause hard-to-debug breakage.

Cloudflare:

- Own outer edge controls, TLS mode, optional HSTS if Cloudflare is the stable HTTPS edge, and coarse security rules.
- Do not rely only on Cloudflare for security headers because self-hosted or direct-origin deployments may bypass it.
- Avoid Cloudflare transformations that inject scripts unless the CSP explicitly accounts for them and the product accepts the tradeoff.
- Avoid caching API responses that include roadmap data, tokens, invite URLs, participant lists, or activity logs.

Choose one authoritative CSP owner per deployment. For this repo's first implementation, Next.js is the best owner for report-only frontend CSP because it can be versioned with the app and can derive the API origin from the same configuration as the client. The proxy can remain the owner for HSTS and broad deployment headers.

## 7. Local development strategy

Local development must not be broken by production CSP decisions.

- Keep production CSP enforcement disabled in local dev.
- Use report-only mode if developers want early visibility.
- Allow the default local API origin: `http://localhost:7878`.
- Include `http://127.0.0.1:7878` if developers commonly use that address.
- Allow Next.js HMR websocket origins in development policy only.
- Allow `unsafe-eval` in development policy only if Next.js dev tooling needs it.
- Do not set HSTS on localhost.
- Do not require Cloudflare or Nginx for local development.
- Keep import/export, local cache hydration, and accountless join flows usable without a deployed proxy.

The development policy can be noisier and less strict than production. The production decision should be based on production build behavior, production URLs, and manual QA rather than dev-server violations.

## 8. Implementation phases

### Phase A: document policy

- Likely files touched: `docs/security/security-headers-policy.md`; optionally `docs/security/README.md` if an index exists later.
- Validation: documentation review against `next.config.ts`, FastAPI middleware, CORS settings, SSE code, and deployment docs.
- Rollback: remove or amend the document.
- Risk: low; no runtime behavior change.

### Phase B: add report-only CSP and conservative headers in Next.js or proxy

- Likely files touched: `apps/web/next.config.ts` for app-owned CSP, or deployment proxy config if the deployment chooses proxy ownership.
- Validation: inspect response headers, load the production build, run browser QA, confirm only expected report-only CSP messages appear.
- Rollback: remove the report-only header or disable it with an environment flag.
- Risk: low to medium; report-only should not block runtime behavior, but noisy reports can hide real violations.

### Phase C: add API headers middleware if needed

- Likely files touched: `apps/api/src/api/middleware/...`, `apps/api/src/api/main.py`, and focused API tests if code work is scheduled.
- Validation: confirm API responses include `nosniff`; sensitive JSON responses include `Cache-Control: no-store`; SSE still streams and is not buffered or cached.
- Rollback: remove middleware or disable the sensitive cache-control branch.
- Risk: medium; incorrect cache headers can hurt performance, and incorrect SSE headers can break realtime behavior.

### Phase D: review reports and tighten CSP

- Likely files touched: CSP generation in `apps/web/next.config.ts` or proxy CSP config; docs if decisions change.
- Validation: review report-only violations across create, save, join, share, import/export, theme switching, fonts, icons, and SSE.
- Rollback: restore the previous report-only policy.
- Risk: medium; tightening may reveal hidden dependencies on inline styles, blob URLs, or dev-only behavior.

### Phase E: enforce production CSP

- Likely files touched: CSP header owner only.
- Validation: production smoke test, manual QA checklist below, response-header inspection, and rollback drill.
- Rollback: switch enforcement back to report-only or remove the CSP header.
- Risk: medium to high; an incorrect enforced policy can break app load, API calls, SSE, images, fonts, or import/export flows.

Current Public Alpha decision: remain in Phase D/report-only. The repository has
no CSP report collector and no recorded production-build browser evidence that
Next.js bootstrap scripts, styled JSX/inline React styles, Markdown, API calls,
and SSE satisfy the proposed enforced policy. Do not add production
`script-src 'unsafe-inline'` simply to bypass that evidence requirement.

## 9. Manual QA checklist

- App loads in production with the intended response headers.
- App loads in local development without production CSP enforcement.
- API requests work for create, fetch, update, delete, share management, join, and activity reads.
- SSE/EventSource works: collaborators see realtime task updates without refresh.
- Join flow works with editor and viewer links.
- Password-protected join flow still prompts and succeeds with the correct password.
- Share modal works: list, copy, rotate, revoke, and public viewer link behavior.
- Export/import works and does not require unexpected `blob:` or `data:` relaxations beyond the documented policy.
- Images, icons, favicons, manifest, and fonts load.
- Theme switching and local-first hydration still work.
- Browser console shows no enforced CSP violations.
- Report-only violations are understood, expected, and tracked before enforcement.
- The app cannot be framed by another origin when `frame-ancestors 'none'` or `X-Frame-Options: DENY` is active.
- API responses containing session tokens, invite URLs, participants, roadmap data, and activity logs are not cached by shared proxies.

## 10. Risks and non-goals

- Do not break local-first browser storage. CSP should protect the page; it should not remove cached roadmap data or auth cache behavior.
- Do not block SSE/EventSource. Realtime collaboration is part of the current product.
- Do not add accounts, OAuth, email verification, password reset, or global identity as part of this policy.
- Do not suggest or introduce WebSockets. Current realtime behavior uses SSE.
- Do not pretend headers solve XSS alone. Input handling, output encoding, dependency hygiene, session expiry, and revocation still matter.
- Do not rely only on Cloudflare. Self-hosters may run without Cloudflare or may expose the origin differently.
- Do not over-tighten CSP before report-only observation. A broken CSP can lock users out of collaboration flows.
- Do not log raw CSP reports without filtering. Reports can include URLs with invite tokens or SSE tickets.
- Do not add broad third-party origins to CSP preemptively.

## 11. Recommended decision

Recommended first implementation path:

1. Keep this document as the RF-827 policy baseline.
2. Keep the existing conservative frontend and Nginx headers: `nosniff`, `DENY`, `strict-origin-when-cross-origin`, and restrictive `Permissions-Policy`.
3. Add a production `Content-Security-Policy-Report-Only` header from the Next.js app as the first implementation step, with `connect-src` derived from `NEXT_PUBLIC_API_URL`.
4. Keep `frame-ancestors 'none'` in CSP and keep `X-Frame-Options: DENY` unless a real embedding use case appears.
5. Add API `nosniff` and `no-store` for sensitive API responses only if the API is reachable directly or if proxy ownership is insufficient.
6. Review report-only output through the manual QA checklist, tighten the policy, then enforce production CSP.

Ownership recommendation:

- Next.js owns frontend CSP and frontend browser-document headers.
- FastAPI owns API CORS, API `nosniff`, and API cache-control for sensitive responses.
- Nginx/reverse proxy owns HSTS, deployment-wide reinforcement, SSE proxy behavior, and direct-origin protection.
- Cloudflare owns outer TLS/edge protections only; it should reinforce but not replace app/proxy policy.

The first version should be simple and conservative: document the policy, start CSP in report-only mode, keep accountless collaboration and local-first behavior intact, preserve API + SSE connectivity, and avoid enforcing brittle CSP rules before production-like observation.

## 12. Header Inspection Commands

Use these commands against local, staging, or production URLs. Replace the
example origins before running. These commands are for inspection only; this
document does not claim deployed validation has been performed.

Frontend headers:

```bash
curl -I https://example-roadforge-web.test/
```

Confirm:

- `Content-Security-Policy-Report-Only` is present.
- `Content-Security-Policy` is not present yet.
- `X-Frame-Options: DENY` is present, or `frame-ancestors 'none'` is visible in report-only CSP.
- `X-Content-Type-Options: nosniff` is present.

API health headers:

```bash
curl -I https://example-roadforge-api.test/api/health
```

Confirm:

- `X-Content-Type-Options: nosniff` is present.
- CSP is not duplicated on JSON API responses.

Sensitive API headers:

```bash
curl -I \
  -H "Authorization: Bearer <session_token>" \
  https://example-roadforge-api.test/api/roadmaps/<roadmap_id>
```

Confirm:

- `Cache-Control: no-store` is present on sensitive roadmap JSON responses.
- `X-Content-Type-Options: nosniff` is present.

SSE headers:

```bash
curl -I "https://example-roadforge-api.test/api/roadmaps/<roadmap_id>/events?ticket=<event_ticket>"
```

Confirm the stream remains SSE-friendly. Do not expect the same `no-store`
behavior as JSON routes; the existing stream uses `Cache-Control: no-cache`.

Local development can use `http://localhost:3020` and `http://localhost:7878`.
Production inspection should use the deployed frontend and API origins, including
the same `NEXT_PUBLIC_API_URL` origin used by the browser.
