# Dependency Audit Policy

See also: [Security documentation index](./README.md) | [SECURITY.md](../../SECURITY.md)

## Overview

RoadForge audits both JS (pnpm workspace) and Python (FastAPI API) runtime dependencies for known vulnerabilities. Audit gates run locally via `make` targets and run in CI as the `js-audit` and `api-audit` jobs.

---

## JS Audit

**Scope:** pnpm workspace, production dependencies only (`--prod`).

**Tool:** `pnpm audit`

**Threshold:** High severity and above (`--audit-level high`). Low and moderate findings are visible but do not block.

**Local command:**
```bash
make audit
# or
make audit-prod
# both run: pnpm audit --audit-level high --prod
```

**CI status:** Active, and clean as of 2026-07-25. The `js-audit` CI job runs on every push and PR.

`next` is pinned to `15.5.21`. The earlier `15.5.18` pin went stale and the gate
failed with twelve advisories, six of them high, all reaching production through
Next: Server Action denial of service, server-side request forgery in rewrites
and in Server Actions, cache confusion of response bodies, unbounded Edge
Server Action payloads, and unauthenticated Server Function disclosure.

Next still pins `postcss@8.4.31` and `sharp@0.34.5`, which remain vulnerable
after that upgrade, so the root `package.json` raises both through
`pnpm.overrides`:

| Override | Reason | Removal condition |
|---|---|---|
| `postcss: ^8.5.23` | Arbitrary file read, source-map path traversal, and `</style>` XSS in `<=8.5.17` | Next ships `postcss >= 8.5.18` |
| `sharp: ^0.35.3` | Inherited libvips CVEs in `<0.35.0`; reachable because `next/image` is used by `Brand` | Next ships `sharp >= 0.35.0` |

Overrides are a version floor, not a suppression: the advisory still has to be
resolved, and each entry is dropped once the upstream pin catches up. Re-check
both on every Next upgrade.

---

## Python Audit

**Scope:** API runtime dependencies declared in `apps/api/pyproject.toml` under `[project.dependencies]`. Dev, test, and audit extras are excluded.

**Tool:** `pip-audit>=2.7` (declared in the `audit` optional-dependency group).

**Threshold:** Any CVE reported by pip-audit against runtime dependencies unless explicitly suppressed (see Suppression Process below).

**Note:** pip-audit audits the installed environment by default, which includes `pip` itself and other installer tooling. The CI job and `make api-audit` use `-r` mode (requirements list) to scope the audit to RoadForge runtime packages only, avoiding noise from installer tool CVEs that do not affect the application.

**Local command:**
```bash
make api-audit
# Requires pip-audit to be installed: pip install "apps/api[audit]"
```

**CI status:** Active. Runtime dependencies are clean. The `api-audit` CI job runs on every push and PR.

---

## Lockfile Policy

**JS:** `pnpm-lock.yaml` is committed to the repository and must not be modified outside of intentional dependency updates. All CI installs use `--frozen-lockfile` to prevent silent lockfile drift.

**Python:** No lockfile currently exists for the API. The `pyproject.toml` specifies minimum version bounds (`>=`), which means builds are not fully reproducible across time. A pinned lockfile (e.g., via `uv.lock`) would improve reproducibility and audit accuracy. This is deferred — see Deferred Work below.

---

## Suppression Process

Suppression is temporary only and requires documented justification.

**Required fields for any suppression:**
- CVE or advisory ID (e.g., `GHSA-xxxx-xxxx-xxxx` or `CVE-YYYY-NNNNN`)
- Affected package and version
- Reason why the vulnerability does not apply or cannot be fixed immediately (e.g., no fix available, only affects unused feature, upgrade blocked by breaking change)
- Owner (GitHub username or team)
- Expiry/review date (maximum 90 days from suppression date)
- Removal plan (what action resolves the suppression: upgrade to version X, drop dependency Y, etc.)

**JS:** Use `.npmrc` or `pnpm.auditConfig.ignoreCves` in `package.json` with a comment block following the above fields. Do not suppress entire packages — suppress specific CVE IDs only.

**Python:** Use a `pip-audit` ignore file (`--ignore-vuln` flag or `.pip-audit-ignore`) with a comment block following the above fields.

All suppressions must be reviewed when the expiry date passes. Expired suppressions with no owner action are treated as CI failures.

---

## Dependabot / Renovate

Automated dependency update PRs (Dependabot, Renovate) are deferred. Both audit CI gates are now active, but automated update tooling will be evaluated after the gates have proven stable over time.

---

## Deferred Work

| Item | Condition for action |
|---|---|
| ~~Add `js-audit` CI job~~ | Done — job active |
| Drop the `postcss` and `sharp` overrides | Next ships patched pins for both |
| ~~Add `api-audit` CI job~~ | Done — job active alongside `js-audit` |
| Python lockfile (`uv.lock`) | Deferred; evaluate when `uv` is adopted as the Python package manager |
| Dependabot / Renovate | Deferred until both audit CI gates are proven stable over time |
