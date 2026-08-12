# Security headers and Content Security Policy

Status: production browser-header baseline implemented. Frontend document responses use a
per-response nonce CSP owned by Next.js middleware. The same policy can be switched to
report-only for bounded observation/rollback without weakening the policy definition.

Related documents:

- [Public deployment security](../public-deployment-security.md)
- [Self-hosting](../self-hosting.md)
- [Session policy](./session-expiry-and-revocation-policy.md)
- [Operational proof gate](./operational-proof-gate.md)

## Threat model

RoadForge processes private roadmap content in the browser and uses roadmap-scoped
credentials. Browser participant sessions are persisted as HttpOnly cookies after a
one-time Bearer-to-cookie exchange; invite credentials are read from URL fragments; the
single-use SSE ticket is also HttpOnly. A successful script injection can still read data
rendered in the current page, initiate actions as the current participant, and interfere
with the create/join bootstrap before the raw token is exchanged. CSP therefore remains a
material defense even though persistent browser credentials are no longer JavaScript
readable.

RoadForge uses fetch and `EventSource`; `connect-src` must preserve the configured API origin
or collaboration breaks.

## Header ownership

Use one authoritative CSP owner per frontend response.

- **Next.js middleware** owns `Content-Security-Policy` or
  `Content-Security-Policy-Report-Only` for document routes.
- **Next.js `next.config.ts`** owns baseline frontend headers.
- **FastAPI** owns API cache/security behavior.
- **nginx / Cloudflare / another HTTPS edge** may reinforce compatible baseline headers and
  HSTS, but must not inject a conflicting second CSP.

The maintained Next.js, FastAPI, and nginx baselines align on `Referrer-Policy: no-referrer`,
`X-Content-Type-Options: nosniff`, frame denial, and a restrictive permissions policy.
Multiple CSP headers are enforced together by browsers, so an edge-added CSP is a deployment
change rather than an override mechanism.

## Production CSP

Each document request receives a fresh unpredictable nonce. Production `script-src` is
nonce-bound and contains neither `unsafe-inline` nor `unsafe-eval`.

The effective production policy contains:

```text
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self' 'nonce-<nonce>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' <configured-api-origin>;
manifest-src 'self';
worker-src 'self' blob:;
```

`upgrade-insecure-requests` is added for the externally observed HTTPS deployment.

### Inline-style residual boundary

RoadForge still uses React style attributes for dynamic colors, geometry, and interaction
state. `style-src 'unsafe-inline'` is therefore an explicit compatibility boundary. It does
not relax executable script policy. Removing it safely requires a dedicated UI/style CSP
refactor rather than adding script exceptions.

## Nonce and cache lifecycle

Frontend middleware creates the nonce, builds CSP for the current environment/API origin,
passes the nonce to Next.js rendering, emits the selected CSP response header, and marks
nonce-bearing document responses private/no-store. Static `/_next/*` and public assets are
outside this nonce-bearing HTML path and retain normal asset caching.

Do not cache nonce-bearing HTML at nginx, Cloudflare, or another CDN.

## CSP operating modes

`ROADFORGE_CSP_MODE` accepts exactly:

```text
report-only
enforce
```

Production defaults/fails closed to `enforce`; development defaults to report-only.
Production script protection must never be “fixed” by adding `unsafe-inline` or
`unsafe-eval`.

## Observation and rollback

After a meaningful frontend/runtime change, an operator may deploy the exact candidate in
report-only mode for a bounded observation window, exercise owner/editor/viewer and
create/join/realtime flows, inspect sanitized CSP evidence, then switch the **same revision**
to enforce and rerun the critical flows.

Rollback to report-only is appropriate only when a required RoadForge flow is reproducibly
blocked and cannot be corrected immediately without an unsafe broad exception. Blocking an
unrequired injected or third-party script is not a rollback reason.

## Incident evidence

CSP/browser diagnostics may contain private roadmap data and migration-era URLs. Never
publish raw invite tokens, session tokens, event tickets, passwords, `Authorization`
values, cookies, full credential-bearing URLs, private roadmap exports, or unredacted
browser/network logs.

New invite credentials use URL fragments and are not sent in HTTP request targets, but
legacy query-token links may still exist until rotated. Treat every copied join URL as
sensitive regardless of transport form.

RoadForge has no server-side CSP report collector in `0.1.0`; this avoids creating another
retention/logging surface for potentially sensitive browser reports.

## Development policy

Development retains the nonce model but may require script `unsafe-eval` for Next.js/React
development tooling. It does not add production script `unsafe-inline`. Development
`connect-src` additionally permits the maintained local API/HMR origins. Never copy those
development allowances into production.

## API, cookie, and realtime compatibility

`connect-src` contains `'self'` plus the origin parsed from `NEXT_PUBLIC_API_URL`. It must
cover:

- normal API fetch requests;
- the one-time Bearer-to-HttpOnly browser session exchange;
- cookie-authenticated roadmap operations;
- one-time SSE ticket creation;
- credential-free EventSource URLs backed by the HttpOnly event-ticket cookie.

CORS, CSRF Origin validation, and CSP are distinct controls. CORS governs which origins may
read API responses; exact-Origin validation protects unsafe cookie-authenticated requests;
frontend CSP governs where RoadForge pages may connect.

## Reverse proxy requirements

The maintained nginx configuration:

- does not define a CSP;
- forwards `X-Forwarded-Proto: https` in the documented HTTPS topology;
- uses access logging that omits query strings and Referer values;
- keeps API/SSE routing separate from frontend routing;
- reinforces baseline headers using values compatible with the application.

An external proxy/edge must preserve CSP, must not cache nonce-bearing HTML, and must be
reviewed separately for URL/header logging. HSTS belongs at the stable HTTPS termination
layer, not local HTTP development.

## Automated proof

The production CSP browser suite verifies enforced nonce CSP, absence of production script
`unsafe-inline`/`unsafe-eval`, nonce annotation/rotation, blocking of an intentionally
unnonced injected script, and normal create/edit flows without unexpected CSP errors.

The dedicated Web CSP workflow additionally runs frontend lint, typecheck, unit tests,
self-hosted Compose validation, and the production Playwright suite. A report-only
development run is not release evidence.

## Change rule

Any CSP relaxation requires a concrete product dependency and production browser evidence.
Prefer a specific source, nonce, or hash over a broad exception. Changes to browser session
cookie transport must be reviewed together with CSP because JavaScript-readable credentials
must not be reintroduced as a shortcut.
