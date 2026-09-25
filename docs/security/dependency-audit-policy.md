# Dependency Audit Policy

The current hardening candidate is summarized in [Internet-facing security audit - 2026-08-12](./internet-facing-audit-2026-08-12.md).

## Policy

RoadForge treats dependency audit findings as release blockers when they affect the runtime dependency set at **high** or **critical** severity.

The required gates are:

```bash
pnpm audit --audit-level high --prod
make api-audit
```

The API gate audits the deterministic runtime export from `apps/api/uv.lock`; CI must not audit a separately resolved environment and call it equivalent.

Maintained GitHub Actions are pinned to immutable upstream commit SHAs so the workflow supply chain is reviewed independently from package-manager lockfiles.

## Exceptions

An exception is allowed only when all of the following are true:

1. the finding is an **exact advisory**, not a broad class of findings;
2. the affected version is transitively required and no safe compatible upgrade is currently available;
3. the vulnerable primitive is not used on an attacker-controlled trust boundary in RoadForge;
4. focused regression coverage exists for the closest affected runtime path;
5. the exception has a public tracking issue and explicit removal conditions;
6. the exception is narrow in tooling and must not hide unrelated future advisories.

## Current exceptions

None. The temporary `nanoid` exception tracked by issue #12 was removed once patched 3.x
releases became installable; `nanoid@<3.3.17` is now raised by a `pnpm.overrides` floor.

## Current overrides

`pnpm.overrides` in the root `package.json` raises transitive packages that Next.js or PostCSS
still pin at vulnerable versions. Overrides are version floors, not suppressions:

| Override | Reason | Remove when |
| --- | --- | --- |
| `nanoid@<3.3.17` → `^3.3.17` | GHSA-2v37-7h3g-55p8 via PostCSS | PostCSS requires a patched `nanoid` |
| `postcss` → `^8.5.26` | Next pins an older PostCSS | Next ships the patched PostCSS |
| `sharp` → `^0.35.4` | GHSA-rgj7-g3m4-5g8c (libheif) via Next image optimization | Next ships `sharp` ≥ 0.35.4 |

Recheck every override on each Next.js upgrade.

## Review requirements

Before each release:

- run both dependency audit gates on the exact candidate head;
- review any exception for continued reachability/assumptions;
- verify lockfiles did not drift from manifests;
- confirm maintained workflow action pins still refer to intended upstream releases/commits;
- update or remove exceptions immediately when their assumptions stop being true.
