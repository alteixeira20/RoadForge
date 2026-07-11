# Contributing to RoadForge

RoadForge is Public Alpha software distributed under the PolyForm
Noncommercial License 1.0.0. Contributions are welcome under the repository
license; commercial use is not granted by contributing.

## Before opening a change

- Read `README.md` and the relevant architecture, API, security, or QA documentation.
- Keep changes small, reviewable, and focused on one behavior.
- Open an issue before broad feature work, schema redesign, authentication changes,
  or deployment architecture changes.
- Never include real invite links, session tokens, passwords, private roadmaps, or
  production data.

## Development

Prerequisites and commands are documented in `README.md`.

Run focused tests while developing. Before opening a pull request, run the complete
repository gate:

```bash
make release-check
```

Also run the relevant manual QA checks for the behavior you changed. State clearly
when a validation step was not run and why.

## Pull requests

- Explain the user-visible behavior and risk.
- List changed contracts, migrations, environment variables, and documentation.
- Include focused tests for bug fixes and shared behavior.
- Preserve backward compatibility for roadmap imports unless the change includes an
  explicit migration and upgrade path.
- Do not commit generated build output, local databases, logs, private planning
  material, or secrets.

Security issues must follow `SECURITY.md`, not a public issue.
