# Contributing to RoadForge

RoadForge is Public Alpha software distributed under the PolyForm
Noncommercial License 1.0.0. Contributions are welcome under the same repository
license; commercial use is not granted by contributing.

## Before opening a change

- Read `CLAUDE.md`, `README.md`, and the relevant `docs/` files.
- Keep changes small, reviewable, and focused on one behavior.
- Open an issue before broad feature work, schema redesign, authentication changes,
  or deployment architecture changes.
- Never include real invite links, session tokens, passwords, private roadmaps, or
  production data.

## Development

Prerequisites and commands are documented in `README.md`. Before submitting a pull
request, run the applicable repository checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose exec api pytest
docker compose exec api alembic upgrade head
```

Also run the focused manual QA steps for the behavior you changed. State clearly when
a command was not run and why.

## Pull requests

- Explain the user-visible behavior and risk.
- List changed contracts, migrations, environment variables, and documentation.
- Include focused tests for bug fixes and shared behavior.
- Preserve backward compatibility for roadmap imports unless the change includes an
  explicit migration and upgrade path.
- Do not commit generated build output, local databases, logs, or secrets.

## AI-assisted contributions

AI tools may help inspect or edit the repository, but the contributor remains
responsible for the result.

- Give the tool only the files and secrets it needs. Do not paste credentials.
- Review every generated diff.
- Do not claim tests, builds, audits, or manual QA ran unless they actually ran.
- Preserve existing user changes and avoid unrelated rewrites.
- Keep license, security, and data-loss decisions under human review.

Security issues must follow `SECURITY.md`, not a public issue.
