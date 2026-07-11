# Security Policy

## Supported versions

RoadForge is currently Public Alpha software. Only the `main` branch receives security fixes. There are no LTS releases, patch branches, or backport commitments.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.** Public issues expose exploit details before a fix is available.

Use **GitHub Security Advisories/private vulnerability reporting** at
`Security → Report a vulnerability`. If that control is unavailable, do not publish
exploit details; open a minimal public issue asking the maintainer to enable a private
reporting channel.

Include in your report:

- Affected component (frontend, backend API, deployment configuration, or dependency).
- Steps to reproduce, including any required environment or configuration.
- Impact assessment: what can an attacker do, and under what conditions.
- Suggested fix, if you have one (optional).

## Response expectations

Reports will be acknowledged after review. The maintainer will assess severity, determine whether a fix is needed, and communicate a resolution plan. No hard SLA is guaranteed at this stage of the project. Reports that include reproduction steps and impact assessments are easier to triage and will receive a faster response.

## No bug bounty

RoadForge does not currently operate a bug bounty program.

## Design context — accountless and local-first

RoadForge has no user account database. There are no passwords stored against user identities, no email addresses, and no OAuth credentials. The threat model is narrower than a typical web application as a result:

- Access is controlled by role-scoped invite tokens and optional roadmap passwords.
- Session tokens are stored in browser `localStorage` scoped to each roadmap.
- A roadmap owner can revoke individual participant sessions or rotate/revoke share links at any time.
- There is no global user identity to compromise, and no password reset or email verification flow.

Vulnerabilities that are still in scope include: invite token or session token exposure, authentication bypass on protected endpoints, server-side injection (SQL, command, or template), insecure direct object reference between roadmaps, and cross-site scripting that can exfiltrate tokens from browser storage.

## CI security gates

Dependency and security audit gates run in CI on every push and pull request:

- `js-audit` — `pnpm audit --audit-level high --prod` against the Node.js dependency tree.
- `api-audit` — Python dependency audit against the FastAPI backend.

High and critical findings from these gates block merges. See [docs/security/dependency-audit-policy.md](docs/security/dependency-audit-policy.md) for details.
