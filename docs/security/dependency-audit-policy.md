# Dependency Audit Policy

The current hardening candidate is summarized in [Internet-facing security audit — 2026-08-12](./internet-facing-audit-2026-08-12.md).

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

## Current exception

The JavaScript audit gate contains a temporary exact-advisory exception for the tracked `nanoid` advisory documented by issue #12.

This exception is **not** a blanket approval for `nanoid`, moderate findings, or future advisories. It must be removed when a safe compatible dependency resolution is available or when RoadForge begins using the affected primitive on an attacker-controlled boundary.

## Review requirements

Before each release:

- run both dependency audit gates on the exact candidate head;
- review any exception for continued reachability/assumptions;
- verify lockfiles did not drift from manifests;
- confirm maintained workflow action pins still refer to intended upstream releases/commits;
- update or remove exceptions immediately when their assumptions stop being true.
