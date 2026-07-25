# Beta Candidate Release Checklist

Two gates, run in order against one frozen candidate.

- **Part A — Candidate freeze and stabilization.** Prove the candidate is
  releasable. Nothing is published.
- **Part B — Release and deployment.** Publish, deploy, smoke, and monitor.

Do not begin Part B until every Part A item is checked or explicitly excepted.

Each item is labelled with what settles it:

| Label | Meaning |
|---|---|
| **[auto]** | A repository command decides it |
| **[local]** | A person runs it on a developer machine against disposable data |
| **[deployed]** | Requires the running candidate; cannot be inferred locally |
| **[decision]** | A person accepts or rejects a risk |
| **[release]** | Only meaningful at publish time |

Exact commands, expected output, and pass/fail criteria for the security,
backup, and deployment items live in the
[operational proof gate](../docs/security/operational-proof-gate.md).

---

## Candidate record

Fill this in before running anything, and do not edit it afterwards. If the
revision changes, the candidate is new and Part A restarts.

```
Candidate revision : <full 40-character SHA>
Branch / tag       : <branch, and tag name once Part B creates it>
Frozen at          : <UTC timestamp>
Release manager    : <name>
Rollback operator  : <name>
Rollback revision  : <full 40-character SHA of the currently deployed release>
Target environment : <staging | production>
```

---

# Part A — Candidate freeze and stabilization

## A1. Freeze rules

- [ ] **[decision]** Feature freeze is declared and communicated. From this
  point the candidate accepts only fixes for release blockers and regressions.
- [ ] **[decision]** Anything else — new features, refactors, dependency bumps
  that are not security fixes, copy changes, roadmap edits — waits for the next
  cycle.
- [ ] **[decision]** Every accepted fix restarts the gates it invalidates. A fix
  touching the web app restarts A2 and A4; a fix touching the API restarts A2
  and A5; a fix touching deployment restarts Part B.
- [ ] **[auto]** `git status --short` is clean and the candidate revision above
  matches `git rev-parse HEAD`.

## A2. Automated gate

- [ ] **[auto]** `make release-check` passes with no skipped steps. This runs
  web tests, the copy/cycles/docs/issues checks, lint, typecheck, production
  build, API lint, API tests against PostgreSQL, and migration drift.
- [ ] **[auto]** `corepack pnpm --dir apps/web test:browser` passes with no
  retries and no skips.
- [ ] **[auto]** `corepack pnpm --dir apps/web benchmark:roadmap` passes every
  budget in [performance.md](../docs/performance.md).
- [ ] **[auto]** `make audit` and `make api-audit` both report no known
  vulnerabilities.
- [ ] **[auto]** The secret, tracked-artifact, and `NEXT_PUBLIC_*` scans in
  [proof gate section 1](../docs/security/operational-proof-gate.md#1-automated--settled-by-repository-commands)
  are clean.
- [ ] **[auto]** CI is green for the candidate revision on every job.
- [ ] **[decision]** Dependency-audit results are reviewed; any suppression has
  an owner and an expiry under the
  [dependency audit policy](../docs/security/dependency-audit-policy.md).
- [ ] **[decision]** Version, changelog, release-state wording, license
  terminology, and demo data are reviewed.

## A3. Local operational rehearsal

- [ ] **[local]** The backup and disposable restore drill in
  [proof gate section 2.1](../docs/security/operational-proof-gate.md#21-backup-and-restore-drill)
  completes and its verification counts match the source.
- [ ] **[local]** The deployable standalone artifact boots and serves, per
  [proof gate section 2.2](../docs/security/operational-proof-gate.md#22-deployable-artifact-boot).

## A4. Browser and accessibility QA

- [ ] **[local]** [Owner/editor/viewer setup and role checks](../docs/manual-qa.md#setup)
  through sharing, joining, read-only enforcement, and two-session realtime.
- [ ] **[local]** [Task creation/editing/PATCH](../docs/manual-qa.md#11--task-creation--editing--done-state),
  [lock and idle draft preservation](../docs/manual-qa.md#12--task-edit-locks),
  and [409 recovery](../docs/manual-qa.md#25--409-conflict-recovery).
- [ ] **[local]** JSON and Markdown export plus replace-current import; the
  checkpoint, roadmap identity, tags, dependencies, subtasks, claims,
  descriptions, estimates, assignees, and done/next state all survive.
- [ ] **[local]** [Version read and restore](../docs/manual-qa.md#22--version-history):
  owner restores, editor reads but cannot restore, viewer cannot read versions.
- [ ] **[local]** Task external links can be added, opened, removed, exported,
  and imported with no credentials and no fetched provider metadata.
- [ ] **[local]** [Mobile layout at 375px](../docs/manual-qa.md#26--mobile-layout-at-375px)
  and 200% zoom show no horizontal overflow on any primary route.
- [ ] **[local]** [Modal keyboard accessibility](../docs/manual-qa.md#32--modal-keyboard-accessibility-focus-trap).
- [ ] **[local]** [Assistive-technology Beta smoke](../docs/manual-qa.md#33--assistive-technology-beta-smoke)
  with NVDA plus Firefox or Chrome, and VoiceOver plus Safari. Record browser,
  assistive-technology version, and operating system.

## A5. Two-session and multi-worker matrix

- [ ] **[local]** [RF-023 two-session collaboration evidence](../docs/manual-qa.md#25b--rf-023-two-session-collaboration-evidence).
- [ ] **[deployed]** Confirm `ROADFORGE_API_WORKERS=1` for memory mode. For
  multiple workers or API instances, confirm
  `ROADFORGE_REALTIME_BACKEND=redis`, Redis connectivity, and the
  [RF-886 regression checklist](../docs/manual-qa.md#30b--rf-886-multi-worker-realtime-regression-checklist).

## A6. Issue intake

- [ ] **[deployed]** The published GitHub chooser renders all six public forms,
  blank issues are disabled, and vulnerabilities route to the private Security
  Advisory form.
- [ ] **[deployed]** The six configured labels exist in the repository and apply
  correctly.

## A7. Candidate decision

- [ ] **[decision]** Blockers are zero, judged against the
  [blocker criteria](../docs/manual-qa.md#blocker-criteria).
- [ ] **[decision]** Non-blocking defects are recorded with owner and
  disposition.
- [ ] **[decision]** The [known acceptable limitations](../docs/manual-qa.md#known-acceptable-limitations)
  are reviewed and still accurate.
- [ ] **[decision]** Part A is signed off by the release manager, with the
  candidate revision unchanged since the freeze.

---

# Part B — Release and deployment

## B1. Release artifacts

- [ ] **[release]** Version bumped and changelog updated for the candidate.
- [ ] **[release]** Tag created on the exact candidate revision.
- [ ] **[release]** Release notes drafted from the template below.

### Release note template

```markdown
## RoadForge <version>

<One paragraph: what this release is for and who it is for.>

### Included
- <user-visible change>

### Known limitations
<Copy the current list from docs/manual-qa.md#known-acceptable-limitations.>

### Upgrading
- Take a PostgreSQL backup before upgrading; see docs/self-hosting.md.
- Migrations run on deploy. Application rollback does not reverse migrations.
- Export roadmaps you care about before upgrading.

### Verified on
- Automated: <gate results>
- Browsers: <browser and version list>
- Assistive technology: <NVDA/VoiceOver versions and platforms>

### Not verified
<Anything a reader should not assume was tested.>
```

- [ ] **[decision]** Release notes advise users to export important roadmaps and
  state the known limitations.

## B2. Deploy preflight

- [ ] **[deployed]** [Self-hosted stack deployment preflight](../deploy/self-hosted/README.md#validation):
  production secrets, URLs, trusted proxies, HTTPS, and health checks are valid.
- [ ] **[deployed]** PostgreSQL backup taken from the target environment, with
  its checksum, immediately before deploying. A missing backup blocks the
  migration outright.
- [ ] **[deployed]** Migration upgrade, drift check, and projection
  backfill/parity complete; `roadmaps.snapshot_json` remains canonical and
  projections remain derivative.
- [ ] **[decision]** Staging candidate is approved before production.

## B3. Deployed security evidence

Run [proof gate section 3](../docs/security/operational-proof-gate.md#3-deployed-manual--requires-a-running-candidate)
in full. Each row there carries its own pass/fail criterion.

- [ ] **[deployed]** Health, headers, CORS, HTTPS/HSTS, and trusted-proxy client
  IPs (3.1–3.4).
- [ ] **[deployed]** Credential-safe proxy and application
  [log review](../deploy/self-hosted/README.md#credential-safe-log-review).
  Record the reviewed time range and upstream providers; never paste matching
  credentials into the release ticket.
- [ ] **[deployed]** Share-link and session revocation, and rate limiting under
  the real proxy (3.6–3.7).
- [ ] **[deployed]** Worker and realtime mode confirmed (3.10).

## B4. Post-deploy smoke

- [ ] **[deployed]** `/api/health` returns 200, and PostgreSQL plus the
  configured realtime backend are confirmed separately. The liveness response
  alone does not prove dependency or cross-worker health.
- [ ] **[deployed]** Every primary route loads with no console error: `/`,
  `/workspace`, `/shared`, `/join`, `/help`.
- [ ] **[deployed]** Owner creates, saves, and shares a roadmap.
- [ ] **[deployed]** Editor joins and edits; changes propagate to the owner
  within 5 seconds.
- [ ] **[deployed]** Viewer is read-only.
- [ ] **[deployed]** Export produces a file containing no session token, invite
  token, or password.

## B5. Monitoring window

Watch for **at least 24 hours** after the production deploy, or until the first
working day passes, whichever is longer.

- [ ] **[deployed]** Health endpoint checked at the start, after one hour, and
  at the end of the window.
- [ ] **[deployed]** API and proxy error rates reviewed; no sustained 5xx.
- [ ] **[deployed]** Realtime propagation still works at the end of the window.
- [ ] **[deployed]** Container restart count is stable; no restart loop.
- [ ] **[deployed]** Database connection count and disk usage are stable.
- [ ] **[deployed]** No credential appears in logs during the window.

### Roll back immediately if

- The health endpoint is non-200 for more than five minutes.
- Any primary route fails to load or throws a JS error.
- Save to server fails with an unrecoverable error that is not a 409.
- Realtime events stop firing within 5 seconds under normal conditions.
- Data loss or corruption is observed or credibly reported.
- A credential appears in logs or in an export.

### Rollback

- [ ] **[deployed]** Redeploy the rollback revision recorded in the candidate
  block, following [rollback notes](../deploy/self-hosted/README.md#rollback-notes).
- [ ] **[deployed]** Application rollback does not reverse migrations. If the
  schema moved, restore PostgreSQL from the pre-deploy backup into a fresh
  database rather than downgrading in place.
- [ ] **[deployed]** Confirm health and one owner create/save cycle after
  rolling back.
- [ ] **[decision]** Record what failed, the evidence, and the owner of the fix.

## B6. Close out

- [ ] **[release]** Release notes published with the final verified/not-verified
  lists.
- [ ] **[decision]** Evidence from
  [proof gate "evidence to retain"](../docs/security/operational-proof-gate.md#evidence-to-retain)
  is stored beside the release ticket, with credentials redacted.
- [ ] **[decision]** Defects found during the window are filed with owners.
