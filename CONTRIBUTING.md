# Contributing to RoadForge

RoadForge welcomes focused bug fixes, documentation improvements, accessibility work,
tests, and well-scoped product improvements.

RoadForge is currently source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE). It is not OSI-approved open source,
and commercial use is not granted by contributing. Any future relicensing decision is
separate from the contribution workflow described here.

## The short path

For most contributions:

```bash
git clone https://github.com/alteixeira20/RoadForge.git
cd RoadForge
corepack enable
pnpm install --frozen-lockfile
make start
make release-check
```

The reference JavaScript runtime is Node 24 (`.nvmrc`) with pnpm 9.15.9. Python 3.12
is used by the API. Docker + Docker Compose are required for the standard PostgreSQL
backend/test path.

Read [docs/contributor-guide.md](docs/contributor-guide.md) when you need architecture,
data, test, migration, or security boundaries.

## Before changing code

You can open a pull request directly for:

- a reproducible bug with a focused fix;
- a documentation correction;
- a test improvement;
- a bounded accessibility/usability defect;
- small internal cleanup that does not change architecture or persisted contracts.

Open an issue first for:

- a new feature or new visible product concept;
- broad refactors;
- database/schema redesign;
- authentication/authorization changes;
- import/export format changes;
- deployment/realtime architecture changes;
- anything that changes RoadForge's local-first/accountless product contract.

This keeps contributors from spending time implementing a product decision that has
not been accepted.

## Pick an issue

The issue chooser supports dedicated forms for:

- bugs;
- usability problems;
- feature requests;
- documentation problems;
- self-hosting/deployment problems;
- accessibility barriers.

A `good first issue` should already contain a clear outcome, acceptance criteria,
likely implementation area, and expected tests. We do not use newcomer labels to
delegate undefined architecture work.

## Security and private data

Do **not** publish:

- participant session tokens;
- owner/editor/viewer invite links;
- roadmap passwords;
- private roadmap exports/content;
- production database contents;
- Redis/database credentials;
- private logs or URLs that expose credentials.

Report vulnerabilities privately according to [SECURITY.md](SECURITY.md), not in a
public issue.

## Development expectations

Keep changes small enough to review as one coherent outcome. Prefer existing module
boundaries over adding another abstraction for a single use.

Before opening a PR:

```bash
make release-check
```

Then run the manual checks relevant to your change. Examples:

- UI interaction -> focused browser/manual keyboard test;
- import/export -> JSON round-trip + compatibility fixture;
- persistence/schema -> migration + PostgreSQL-backed tests;
- realtime -> independent participant contexts and Redis path when applicable;
- security/access -> role-negative tests, not only successful-path tests.

If a relevant check was not run, say so in the PR. An explicit missing check is better
than an implied result.

## Pull requests

Use the repository pull-request template. A strong PR explains:

1. the user/maintenance problem;
2. the smallest solution implemented;
3. contracts or persisted data affected;
4. tests/manual evidence;
5. compatibility/security/deployment risk;
6. recovery or rollback when the change is stateful.

Avoid drive-by formatting, renames, dependency bumps, and unrelated cleanup in the same
PR unless they are required for the stated outcome.

## Compatibility rules

RoadForge has existing roadmap data in browsers and servers. Do not casually break it.

- Preserve supported historical JSON imports or add an explicit upgrade path.
- Do not silently discard unknown portable snapshot fields.
- Treat PostgreSQL migrations as forward changes; do not rewrite applied migrations.
- Preserve exact optimistic-concurrency checks for server writes.
- Keep credentials and transient collaboration state out of portable JSON.

See [docs/architecture/source-of-truth-rules.md](docs/architecture/source-of-truth-rules.md).

## Review priorities

Reviewers prioritize, in order:

1. correctness and data integrity;
2. authorization/security;
3. compatibility and recovery;
4. missing tests;
5. user experience/accessibility;
6. maintainability;
7. style preferences.

A green CI run is required evidence, not proof that a design is correct.

## Documentation

Current behavior belongs in current reference/runbook documentation. Historical design
reasoning should be clearly marked as a decision/history record rather than left looking
like an active implementation plan.

The documentation map is maintained in [docs/README.md](docs/README.md).

## Help

If you are unsure whether a change belongs in an issue first, open a short scoped issue
describing the problem and intended outcome. Maintainers can confirm the direction
before implementation begins.
