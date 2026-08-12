# Security Policy

## Supported versions

RoadForge is currently pre-release software. Only the `main` branch receives
security fixes. There are no LTS releases, patch branches, or backport
commitments.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.** Public issues expose exploit details before a fix is available.

Use **GitHub Security Advisories/private vulnerability reporting** at
`Security → Report a vulnerability`. If that control is unavailable, do not publish
exploit details; open a minimal public issue asking the maintainer to enable a private
reporting channel.

Include in your report:

- Affected component (frontend, backend API, MCP package, deployment configuration, or dependency).
- Steps to reproduce, including any required environment or configuration.
- Impact assessment: what can an attacker do, and under what conditions.
- Suggested fix, if you have one (optional).

## Response expectations

Reports will be acknowledged after review. The maintainer will assess severity, determine whether a fix is needed, and communicate a resolution plan. No hard SLA is guaranteed at this stage of the project. Reports that include reproduction steps and impact assessments are easier to triage and will receive a faster response.

## No bug bounty

RoadForge does not currently operate a bug bounty program.

## Design context — accountless and local-first

RoadForge has no user account database. There are no passwords stored against user identities, no email addresses, and no OAuth credentials. This removes a global identity boundary but does not make shared roadmaps public.

- Access is controlled by roadmap-scoped role invite tokens and optional roadmap passwords.
- New invite URLs carry the credential in a URL fragment and the join page scrubs it after bootstrap. Legacy query-token links remain a migration-only compatibility path.
- The browser exchanges a newly issued participant Bearer token for a roadmap-path-scoped `HttpOnly`, `SameSite=Strict` session cookie before persisting auth state. Pre-hardening browser Bearer tokens migrate on the next successful hydration.
- Non-browser API/MCP clients intentionally use explicit participant Bearer sessions.
- Cookie-authenticated unsafe requests require an explicitly allowed `Origin` in addition to SameSite protection.
- An owner can revoke individual participant sessions or rotate/revoke share links at any time.
- SSE uses a 30-second, single-use, roadmap/participant-scoped ticket delivered only through a path-scoped HttpOnly cookie; event URLs contain no credential.
- There is no global user identity to compromise and no password-reset or email-verification flow.

Vulnerabilities that remain in scope include invite/session leakage, authentication or authorization bypass, cross-roadmap object access, CSRF/origin-check bypass, cross-site scripting, server-side injection, unsafe import/link handling, credential leakage through logs/URLs, realtime authorization bypass, and deployment/supply-chain weaknesses.

A successful XSS remains security-relevant even though persistent browser session cookies are HttpOnly: page scripts can read rendered roadmap data and can act through the victim's authenticated browser. The production nonce CSP is therefore part of the security boundary.

## CI security gates

Security/release validation includes:

- JavaScript production dependency audit (`pnpm audit --audit-level high --prod`).
- Locked Python runtime dependency audit.
- API authorization/revocation/Redis/migration tests.
- Web unit and production-browser/CSP tests.
- MCP syntax/protocol/package tests.
- Production container builds and self-hosted Compose validation.
- Documentation/release contracts.

Maintained GitHub Actions are pinned to immutable upstream commit SHAs and workflows use read-only repository permissions unless a narrowly scoped write is explicitly required.

High and critical dependency findings block the normal release gate except for a documented, time-bounded exception process. See [docs/security/dependency-audit-policy.md](docs/security/dependency-audit-policy.md).
