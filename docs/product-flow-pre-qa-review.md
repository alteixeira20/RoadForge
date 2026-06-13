# Product Flow Pre-QA Review

Review date: 2026-06-13

Status: static acceptance complete; executable QA pending

## Beta boundary

The beta remains an accountless, local-first roadmap collaboration product.

Fix before beta QA:

- persistent claims with explicit owner override;
- coherent tag registry and combined filtering;
- visible beta/WIP and non-commercial source-available language;
- stacked accessible notifications and consistent import/export feedback;
- Auto/Manual phase color behavior;
- production proxy, body-limit, and API-doc hardening;
- source-release community, security, and self-hosting documents.

Deferred after beta:

- OAuth, accounts, workspaces, account claims, billing, telemetry, and admin UI;
- custom public slugs and community discovery;
- PDF/Markdown exports, saved views, duplication, and advanced conflict resolution;
- executable MCP or assistant write integrations.

Discarded for the beta:

- claims that silently expire;
- editor takeover of another participant's claim;
- marketing claims of production readiness;
- calling a non-commercial license open source.

## Implemented polish

- Notifications stack below the header, expose live-region semantics, support manual
  dismissal, limit visible volume, and respect reduced motion.
- Import provides feedback before the native file picker; exports announce preparation
  before generating the download.
- Phase colors support backward-compatible Manual mode and derived Auto mode with an
  explanation, presets, and validated custom hex values.
- Filtering has a single pure model, combined categories, per-roadmap session state,
  chips, clear actions, and focused empty states.

## Residual QA risks

- Browser file-dialog timing varies by platform.
- Auto color reason and custom color controls need keyboard and screen-reader review.
- Toast stacking and narrow-view positioning need visual review.
- Large-roadmap filtering and color derivation need measured performance evidence.
- All new API, migration, frontend, and style changes still require the full phase-41
  command and manual QA matrix.

No formatter, linter, typecheck, test, build, migration, browser, or deployment command
was run under the repository command restrictions.
