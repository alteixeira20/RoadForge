# Dependency audit policy

RoadForge audits JavaScript and Python runtime dependencies on every release candidate.
Known high-severity findings are release blockers unless a narrowly scoped, documented,
time-bounded exception exists because no installable fix is available.

## JavaScript audit

**Scope:** production dependencies in the pnpm workspace.  
**Tool:** `pnpm audit`.  
**Threshold:** high severity and above.

```bash
make audit
# equivalent production audit
pnpm audit --audit-level high --prod
```

CI runs the same high-severity production gate.

### Transitive overrides

RoadForge uses pnpm overrides only when a framework pin leaves an installable patched
transitive version available:

| Override | Reason | Removal condition |
| --- | --- | --- |
| `postcss: ^8.5.23` | historical PostCSS security fixes above framework-pinned vulnerable ranges | remove when Next's normal graph is at least as safe |
| `sharp: ^0.35.3` | patched libvips/sharp line used by `next/image` | remove when Next's normal graph is at least as safe |

An override is **not** an audit suppression. The resulting package graph must still pass
`pnpm audit` unless an explicit temporary exception below applies.

### Current temporary exception

As of 2026-08-10:

| Field | Value |
| --- | --- |
| Advisory | `GHSA-2v37-7h3g-55p8` |
| Package | transitive `nanoid@3.3.16` through PostCSS |
| Reason | the advisory names `>=3.3.17` as patched, but npm's installable 3.x/legacy line currently stops at `3.3.16` |
| Owner | `alteixeira20` |
| Expiry/review | **2026-08-17** |
| Tracking | GitHub issue #12 |
| Removal plan | resolve `nanoid >=3.3.17` through the normal dependency graph, remove the GHSA exception, regenerate the lockfile, and require a clean unsuppressed audit |

The exception is configured by exact GHSA ID in root `pnpm.auditConfig.ignoreGhsas`.
The audit severity threshold is unchanged and no other nanoid/advisory finding is ignored.

Do not silently extend the date. If a patched release is still unavailable at expiry,
update issue #12 with current upstream evidence and explicitly re-review the exposure.

## Python audit

**Scope:** runtime dependencies from `apps/api/pyproject.toml`; development/test/audit
tooling is excluded from the production dependency list.  
**Tool:** `pip-audit`.  
**Policy:** reported runtime vulnerabilities fail the gate unless an explicitly reviewed
exception exists.

```bash
make api-audit
```

The CI/API audit builds a runtime dependency list rather than auditing unrelated installer
tooling in the environment.

## Reproducibility

### JavaScript

`pnpm-lock.yaml` is committed. CI installs with:

```bash
pnpm install --frozen-lockfile
```

Never hand-edit a resolved dependency/integrity value to make an audit pass. Dependency
updates must be intentional and reproducible.

### Python

RoadForge still needs a committed generated Python dependency lock for full build
reproducibility. This is tracked separately in issue #7. Until it lands, the audit checks
the resolved runtime graph for each candidate but does not make two builds of the same
commit cryptographically identical dependency sets.

## Exception process

A dependency-audit exception is allowed only when a normal patched dependency cannot be
installed safely yet or the vulnerability is demonstrably unreachable and an immediate
upgrade would create greater verified risk.

Every exception must record:

- GHSA/CVE ID;
- package and resolved version/path;
- why an immediate fix is unavailable/inapplicable;
- owner;
- expiry/review date, maximum 90 days and normally much shorter;
- tracking issue;
- concrete removal plan.

JavaScript exceptions must target specific advisory IDs (`ignoreGhsas` / `ignoreCves`),
never an entire dependency. Python exceptions must likewise target specific vulnerability
IDs.

An exception is not permission to stop checking for a fix. The owner should remove it as
soon as an installable patched graph exists, even before the expiry date.

## Dependency update review

For every security-driven update:

1. identify the actual vulnerable path;
2. prefer the upstream/direct patched graph over a permanent override;
3. regenerate the lock intentionally;
4. install with frozen-lock verification;
5. run the dependency audit;
6. run relevant build/runtime tests because semver-compatible transitive changes can still break behavior;
7. remove obsolete overrides/exceptions.

Dependabot is configured where supported, but automated update PRs still require the same
review/evidence as manual dependency changes.

## Release rule

A release may proceed only when:

- production JS/Python audit gates pass; or
- every remaining blocking finding has an unexpired exact-ID exception satisfying this
  policy and an explicit release note when material to users/operators.

Expired or undocumented exceptions are release failures.
