# Contributing to RoadForge

RoadForge is pre-release, source-available software distributed under the
PolyForm Noncommercial License 1.0.0. The license is not OSI-approved open
source. Contributions are welcome under the repository license; commercial use
is not granted by contributing.

## Before opening a change

- Read `README.md` and the relevant architecture, API, security, or QA documentation.
- Keep changes small, reviewable, and focused on one behavior.
- Open an issue before implementing a feature, broad refactor, schema redesign,
  authentication change, or deployment architecture change. Small bug fixes and
  documentation corrections can go directly to a pull request.
- Never include credentials, invite links, session tokens, passwords, private
  roadmaps, production data, or local tooling artifacts.

## Issues and security

- Use the [public issue chooser](https://github.com/alteixeira20/RoadForge/issues/new/choose)
  for bug, usability, feature, documentation, self-hosting, or accessibility reports.
- Read the [issue reporting guide](docs/issue-reporting.md) before sharing
  diagnostics; never attach roadmap exports, private logs, tokens, or secrets.
- Report vulnerabilities privately through [GitHub security advisories](https://github.com/alteixeira20/RoadForge/security/advisories/new), not a public issue.

## Development

Follow the [contributor guide](docs/contributor-guide.md) for the fresh-clone
walkthrough, architecture and module ownership, roadmap schema, storage and
security boundaries, tests, migrations, triage, and good-first-issue policy.
Runtime prerequisites and commands are also indexed in [README.md](README.md).

Run focused tests while developing. Before opening a pull request, run the complete
repository gate:

```bash
make release-check
```

Also run the relevant manual QA checks for the behavior you changed. State clearly
when a validation step was not run and why.

## Pull requests

- Use the [pull request template](.github/pull_request_template.md) and explain the user-visible behavior and risk.
- List changed contracts, migrations, environment variables, and documentation.
- Include focused tests for bug fixes and shared behavior.
- Preserve backward compatibility for roadmap imports unless the change includes an
  explicit migration and upgrade path.
- Do not commit generated build output, local databases, logs, private planning
  material, or secrets.

Public contributions are accepted under the repository's [PolyForm Noncommercial License 1.0.0](LICENSE).
Security issues must follow [SECURITY.md](SECURITY.md), not a public issue.
