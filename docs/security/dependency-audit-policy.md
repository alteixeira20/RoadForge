# Dependency audit and lock policy

RoadForge treats dependency reproducibility and vulnerability scanning as separate release
controls: a lock determines *which* artifacts a commit resolves, while an audit checks the
known security state of that locked graph at a point in time.

## JavaScript

Production JavaScript dependencies are installed from committed `pnpm-lock.yaml` with:

```bash
pnpm install --frozen-lockfile
pnpm audit --audit-level high --prod
```

The high-severity threshold remains a release gate. Transitive overrides may raise an
upstream framework pin to an installable patched release, but an override is not an audit
suppression.

As of 2026-08-10, `GHSA-2v37-7h3g-55p8` against transitive `nanoid@3.3.16` has a narrowly
scoped temporary exception on the release-baseline work because the advisory names
`>=3.3.17` as fixed while an installable legacy 3.x release is not yet available. The
exception expires/reviews on **2026-08-17**, is tracked by issue #12, and must be removed as
soon as a patched graph can be installed. The audit severity threshold is not lowered.

## Python authoritative files

The API dependency contract is:

```text
apps/api/pyproject.toml   declared direct dependencies and optional dev/test/audit groups
apps/api/uv.lock          generated complete resolution
apps/api/UV_VERSION       uv version used to maintain/validate the lock
```

`uv.lock` is generated data. Never hand-edit resolved versions, hashes, or package records.

The lock is maintained with the exact uv version in `UV_VERSION` so local, CI, and Docker
use the same lock semantics.

## Python lock validation

Run:

```bash
make api-lock
```

or directly:

```bash
cd apps/api
bash scripts/check-lock.sh
```

The check:

1. installs the pinned uv tool version;
2. runs `uv lock --check`, failing when `pyproject.toml` and `uv.lock` disagree;
3. exports the runtime dependency set twice from the existing lock in offline/frozen mode;
4. requires the two exports to be byte-identical.

The path-scoped **API Locked Validation** workflow runs the same contract on relevant pull
requests and on API-related pushes to `main` or `dev`.

## Locked environments

`apps/api/scripts/sync-locked-env.sh` is the shared environment bootstrap.

Runtime only:

```bash
cd apps/api
bash scripts/sync-locked-env.sh
```

Development lint tooling:

```bash
bash scripts/sync-locked-env.sh dev
```

Tests:

```bash
bash scripts/sync-locked-env.sh test
```

Audit tooling:

```bash
bash scripts/sync-locked-env.sh audit
```

Each path first verifies lock drift, then uses `uv sync --frozen`; it does not silently
re-resolve dependencies.

The **API Locked Validation** workflow exercises lint, migration/schema drift, the full API
test suite, the real-Redis revocation suite, and runtime auditing from those locked
environments. The production API Docker image also installs its runtime graph from
`uv.lock` and verifies the lock before installing RoadForge itself non-editably.

The repository's broader CI remains responsible for cross-project quality, web/browser,
container, deployment, MCP, and complementary API checks. The locked workflow is the
reproducibility proof for Python dependency resolution; a green floating resolution is not
a substitute for it.

## Python runtime audit

Run:

```bash
make api-audit
```

The audit does **not** ask pip to independently solve the minimum bounds from
`pyproject.toml`. Instead it exports the runtime-only set from `uv.lock` and passes that
exact requirements set to `pip-audit`.

This excludes development/test/audit-only packages from the production application audit
while ensuring the scanned versions are the versions the release lock actually selected.

## Updating Python dependencies

When adding, removing, or intentionally upgrading a Python dependency:

```bash
cd apps/api
python -m pip install --disable-pip-version-check "uv==$(cat UV_VERSION)"
uv lock --python 3.12
uv lock --check
cd ../..
```

Then review the generated `apps/api/uv.lock` diff. A dependency PR should explain material
version changes rather than treating the generated diff as opaque.

Before opening/merging the PR, run at minimum:

```bash
make api-lock
make api-audit
make api-lint
make api-test
make api-check
```

For a release candidate, also require the complete container/release CI because the
production API image consumes the lock.

Do not use `uv sync` without `--frozen` in validation/production paths merely to make a
stale lock pass. Regeneration is an intentional dependency update and belongs in the diff.

## Updating uv itself

Changing `apps/api/UV_VERSION` is a dependency-tooling change. In the same PR:

1. update `UV_VERSION`;
2. regenerate `uv.lock` with the new uv version;
3. run `make api-lock`;
4. compare the lock diff for unexpected resolver changes;
5. run API audit/tests/migrations/container validation.

Do not float to whatever uv version happens to be preinstalled on a contributor or CI
runner.

## Suppression process

Vulnerability suppression is temporary and exact-ID only.

Every exception must record:

- GHSA/CVE ID;
- package and resolved version/path;
- why an immediate patched graph cannot be used;
- owner;
- expiry/review date (maximum 90 days, normally much shorter);
- tracking issue;
- concrete removal plan.

Do not suppress an entire package when a single advisory is the exception. Do not silently
extend an expiry date. An expired undocumented exception is a release failure.

## Automated dependency updates

Automated update tooling may propose changes, but generated PRs do not bypass review. A
dependency bot must update the authoritative manifest/lock pair supported by the ecosystem
and still pass the same audit, test, migration, and production-image gates.

If an updater cannot safely maintain `uv.lock`, keep Python updates manual rather than
accepting manifest-only drift.

## Release rule

A RoadForge release candidate must have:

- a frozen `pnpm-lock.yaml` accepted by `pnpm install --frozen-lockfile`;
- a `uv.lock` accepted by `uv lock --check`;
- JavaScript and locked Python runtime audits passing, except for documented unexpired
  exact-advisory exceptions;
- API tests and migration/schema-drift checks executed from the locked Python graph;
- the production API container built from the locked runtime graph.

A green audit, test run, or container build from a different Python dependency resolution is
not evidence for the candidate.
