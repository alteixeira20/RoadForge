# Security headers and Content Security Policy

Status: `0.1.0` browser-header baseline implemented. Production RoadForge document
responses use a per-response nonce CSP owned by Next.js middleware. The deployment can
explicitly switch the same policy to report-only for observation or emergency rollback.

Related documents:

- [Public deployment security](../public-deployment-security.md)
- [Self-hosting](../self-hosting.md)
- [Manual QA](../manual-qa.md)
- [Operational proof gate](./operational-proof-gate.md)

## Threat model

RoadForge stores local roadmap data and participant bearer credentials in browser storage.
A successful script injection can therefore read local roadmap content, act as the current
participant, and attempt data exfiltration. CSP does not make XSS harmless, but it can turn
many script-injection paths into browser-enforced failures.

RoadForge also uses fetch and `EventSource`; a CSP must preserve the configured API origin
in `connect-src` or normal collaboration breaks.

## Header ownership

Use one authoritative CSP owner per frontend response.

- **Next.js middleware** owns `Content-Security-Policy` or
  `Content-Security-Policy-Report-Only` for document routes.
- **Next.js `next.config.ts`** owns baseline frontend headers such as `nosniff`, frame,
  referrer, and permissions policy.
- **FastAPI** owns API-specific cache/security behavior.
- **nginx / Cloudflare / another HTTPS edge** may reinforce compatible baseline headers and
  HSTS, but must not inject a second CSP with different directives.

Multiple CSP headers are enforced together by browsers. A proxy-added policy therefore does
not override the app policy; it can accidentally make the effective policy stricter and
break RoadForge.

## Production CSP

Each document request receives a fresh unpredictable nonce. The production script directive
is equivalent to:

```text
script-src 'self' 'nonce-<per-response-nonce>' 'strict-dynamic'
```

Production `script-src` contains neither `unsafe-inline` nor `unsafe-eval`.

The complete production policy contains these controls:

```text
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self' 'nonce-<nonce>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' <configured-api-origin>;
manifest-src 'self';
worker-src 'self' blob:;
```

`upgrade-insecure-requests` is added only when the externally observed request is HTTPS.
The maintained nginx configuration already forwards `X-Forwarded-Proto: https` to the web
container. This avoids making local production smoke tests served over HTTP attempt HTTPS
subresource loads while still hardening real HTTPS deployments.

### Why styles still allow inline CSS

RoadForge currently uses React `style` attributes for dynamic colors, geometry, and
interaction state. This work targets executable script injection; it does not pretend that
a nonce on `<style>` tags would authorize arbitrary element style attributes.

`style-src 'unsafe-inline'` is therefore an explicit residual boundary, not an accidental
script exception. A future style-CSP project can remove it only after the UI no longer
depends on inline style attributes.

## Nonce lifecycle

`apps/web/src/middleware.ts`:

1. creates a new nonce for a document request;
2. constructs the CSP for the current environment/API origin;
3. overwrites the internal request `x-nonce` value;
4. places the CSP on the internal request so Next.js can parse the nonce during rendering;
5. emits the selected CSP response header;
6. marks nonce-bearing document responses `private, no-store`.

`apps/web/src/app/layout.tsx` uses a request-time dynamic API so document rendering is not
statically prerendered. Next.js can then apply the request nonce to framework, page, and
hydration scripts.

Do not cache nonce-bearing HTML at nginx, Cloudflare, or another CDN. Static `/_next/*` and
public asset paths are excluded from nonce middleware and retain normal asset caching.

## CSP operating modes

`ROADFORGE_CSP_MODE` accepts exactly:

```text
report-only
enforce
```

Behavior:

- production default or unknown value -> `enforce`;
- development default or unknown value -> `report-only`;
- explicit `report-only` -> emit `Content-Security-Policy-Report-Only` while Next.js still
  receives the same nonce policy internally for correct script annotation;
- explicit `enforce` -> emit `Content-Security-Policy`.

Production fails closed so a mistyped environment value cannot silently disable script
protection.

## Observation before public enforcement

For a new public deployment or after a meaningful frontend/runtime upgrade:

1. deploy the exact candidate with `ROADFORGE_CSP_MODE=report-only`;
2. confirm there is no separate CSP being injected by the proxy/edge;
3. exercise the deployed manual QA flows in independent browser contexts;
4. inspect browser console CSP reports for every supported route and role;
5. sanitize any evidence before attaching it to an issue;
6. after the observation window is clean, set `ROADFORGE_CSP_MODE=enforce` and redeploy the
   **same application revision**;
7. rerun critical create/open/import/export/share/join/realtime checks.

The repository's production Playwright gate runs with `ROADFORGE_CSP_MODE=enforce`; the
observation period is a deployed-configuration step, not a substitute for enforced CI.

## Rollback criteria

Switch the deployed instance back to `ROADFORGE_CSP_MODE=report-only` when a reproducible
legitimate RoadForge flow is blocked by CSP and the block cannot be corrected immediately
without adding an unsafe broad exception.

Examples:

- hydration or route navigation cannot complete;
- a required same-product bundle is rejected;
- owner/editor/viewer UI becomes unusable;
- import/export or Share/Join stops functioning because of a CSP directive;
- API fetch or SSE is blocked for the configured legitimate API origin.

Do **not** roll back CSP merely because an injected/third-party script is blocked. First
confirm the blocked resource is a required RoadForge dependency.

Do not “fix” an incident by adding permanent production `script-src 'unsafe-inline'` or
`'unsafe-eval'`.

## Incident evidence

CSP diagnostics can contain URLs. Join URLs may contain bearer invite credentials, and
other browser/network evidence can contain session tokens or private roadmap details.

Record only what is required to reproduce the directive failure:

- RoadForge revision;
- deployed CSP mode;
- affected route category (not a token-bearing URL);
- violated directive;
- sanitized blocked origin/path category;
- browser/version;
- reproducible product action;
- whether report-only or enforcement was active.

Do not publish invite tokens, session tokens, passwords, `Authorization` values, full join
URLs, private roadmap exports, or unredacted browser logs.

RoadForge does not add a server-side CSP-report collector in `0.1.0`. Avoiding a collector
also avoids creating a new retention/logging surface for potentially sensitive report URLs.
Browser QA and automated console monitoring are the current observation mechanism.

## Development policy

Development keeps the nonce model but defaults the browser-facing response to report-only.
The script directive additionally permits `unsafe-eval`, which Next.js/React development
instrumentation may require. It does **not** add script `unsafe-inline`.

Development `connect-src` additionally allows the maintained local API and HMR origins:

```text
http://localhost:7878
http://127.0.0.1:7878
ws://localhost:*
ws://127.0.0.1:*
```

Never copy those development allowances into a production policy.

## API and realtime compatibility

`connect-src` contains `'self'` plus the origin parsed from `NEXT_PUBLIC_API_URL` when the
configured value is a valid absolute URL.

This must cover:

- normal API fetch requests;
- Bearer-authenticated protected operations;
- one-time SSE ticket creation;
- `EventSource` connections to roadmap events.

CORS and CSP are separate controls: CORS determines which browser origins may read API
responses, while frontend CSP determines where RoadForge pages may connect. Both must match
the intended production topology.

## Reverse proxy requirements

The maintained `deploy/self-hosted/nginx/roadforge.conf`:

- does not define a CSP;
- forwards `X-Forwarded-Proto: https` in the documented HTTPS topology;
- keeps safe access logging that omits query strings and Referer values;
- keeps API/SSE routing separate from frontend document routing.

An external proxy/edge must preserve the application CSP response header and must not cache
nonce-bearing HTML. If it replaces or adds CSP, treat that as a deployment change requiring
the same production browser proof.

HSTS belongs at the stable HTTPS termination layer, not in local HTTP development.

## Automated proof

`apps/web/e2e/csp.spec.ts` verifies a production standalone build:

- returns an enforced CSP and no report-only duplicate;
- contains a nonce-bound strict production `script-src`;
- contains no production script `unsafe-inline`/`unsafe-eval`;
- assigns the response nonce to executable inline scripts emitted by the application;
- generates a fresh nonce after reload;
- blocks an intentionally injected unnonced inline script;
- emits no unexpected CSP console errors during a normal RoadForge create/edit flow.

`apps/web/playwright.production.config.ts` also runs the core browser smoke and hydration
specs under enforced production CSP.

The path-scoped `Web CSP Validation` GitHub Actions workflow runs web lint, typecheck, unit
tests, and the production CSP/core-flow Playwright suite.

A report-only development run is not release evidence for the production policy.

## Manual release proof

Before declaring CSP ready on the actual public deployment, verify:

- landing/create/local persistence;
- JSON import and export/download;
- owner/editor/viewer routes in independent contexts;
- Share and Join/password behavior;
- API writes and conflict recovery;
- SSE reconnect/realtime updates;
- report/problem links;
- fonts, icons, manifest, images, and dynamic UI styles;
- no unexpected CSP console errors;
- no duplicate CSP at the proxy or Cloudflare layer.

MCP is not a browser script surface, but the normal MCP package/documentation gate still
must pass because this security change must not alter documented collaboration credentials
or API semantics.

## Change rule

Any future CSP relaxation requires a concrete product dependency and production browser
evidence. Prefer a specific source, nonce, or hash over a broad exception. Never add
production script `unsafe-inline`/`unsafe-eval` simply to make a failing build green.
