# RoadForge release readiness

**Status:** Current reference.

Use this document as the maintained entry point for merge and release readiness. Historical audits are point-in-time evidence and do not override current code, tests, or maintained contract documentation.

## Evidence order

1. Current code and executable tests.
2. Current contract and reference documentation.
3. Exercised operational runbooks.
4. Architecture and design records.
5. Historical audits and roadmap snapshots.

## Required automated evidence

The exact candidate revision must pass the permanent checks relevant to its changed paths. A successful run from an older revision does not certify a later candidate.

The maintained release workflow covers web quality and behavior, API quality and behavior, database migrations, multi-worker behavior, dependency audits, package validation, deployment configuration, and production browser checks.

## Required manual evidence

Use [`manual-qa.md`](manual-qa.md) for scenarios that automated checks cannot fully prove. Record what was actually run; use `NOT RUN` when evidence was not collected rather than implying success.

## Review priorities

Review in this order:

1. correctness and data integrity;
2. authorization and security;
3. compatibility and recovery;
4. missing or misleading evidence;
5. user experience and accessibility;
6. maintainability and architecture;
7. style preferences.

## Current references

Use these maintained documents for present behavior:

- [`architecture/overview.md`](architecture/overview.md)
- [`architecture/source-of-truth-rules.md`](architecture/source-of-truth-rules.md)
- [`access-model.md`](access-model.md)
- [`backend-api.md`](backend-api.md)
- [`frontend-foundation.md`](frontend-foundation.md)
- [`public-deployment-security.md`](public-deployment-security.md)
- [`security/README.md`](security/README.md)
- [`performance.md`](performance.md)

[`senior-readiness-audit.md`](senior-readiness-audit.md) is retained as historical review evidence. When it disagrees with current code, tests, or maintained references, the current sources above win.
