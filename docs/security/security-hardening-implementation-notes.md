# Security Hardening Implementation Notes

Status: implementation notes for RF-834 through RF-845. Validation has not been
run except where explicitly recorded by the implementer.

## Implemented

- Participant session expiry schema support exists on `participants.session_expires_at` with a roadmap-scoped expiry index.
- New owner and joined participant sessions set a 30-day expiry.
- Central participant auth rejects revoked sessions, expired sessions, and deleted roadmaps before role checks or writes.
- Valid authenticated requests renew participant sessions by 30 days and update `last_seen_at`.
- Frontend expired-session handling clears only scoped auth cache, preserves the roadmap cache, marks the local copy unsynced, and asks the user to rejoin through an active invite link.
- Owner-facing participant views include compact session expiry metadata.
- App-level in-memory rate limiting covers roadmap creation, join attempts, password failures, event tickets, and owner share-link rotate/revoke.
- Next.js sends a `Content-Security-Policy-Report-Only` header and preserves existing baseline frontend headers.
- FastAPI sends `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` on sensitive roadmap JSON routes while preserving SSE stream behavior.
- Security header inspection commands and a manual security smoke checklist are documented.

## Remaining Work

- Run migration validation locally before deploying the expiry column change.
- Run backend syntax and route tests.
- Run frontend lint, type checks, and production build checks.
- Run the manual security hardening smoke checklist in `docs/manual-qa.md`.
- Review CSP report-only output before considering enforced CSP.
- Revisit limiter storage if the API is moved beyond the current single-worker deployment shape.

## Rebrand Gate

Rebrand work should wait until:

- Migrations are checked locally.
- Backend syntax/tests are checked.
- Frontend lint/type/build checks are complete.
- The manual security hardening smoke checklist has been run.

## Suggested Validation Commands

Migration validation:

```bash
cd apps/api
alembic current
alembic upgrade head
alembic downgrade -1
alembic upgrade head
```

Backend syntax/tests:

```bash
cd apps/api
python -m compileall src
pytest
```

Frontend lint/type/build:

```bash
cd apps/web
pnpm lint
pnpm typecheck
pnpm build
```

Manual QA:

```bash
sed -n '/## 31 — Security hardening smoke checklist/,/---/p' docs/manual-qa.md
```
