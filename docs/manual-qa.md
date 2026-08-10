# RoadForge manual QA

This checklist covers release behavior that static/unit/API checks cannot fully prove.
Run it against the exact candidate revision. Record failures immediately; do not work
around a blocker and still certify the candidate.

## 1. Automated pre-flight

From a clean checkout of the candidate:

```bash
make release-check
```

Then require the exact candidate's GitHub Actions jobs to be green, including the locked
API and production CSP gates when their paths are relevant.

For a disposable local QA database, you may start from a reset:

```bash
make reset
```

`make reset` is destructive: it removes the local development database and then starts
the normal RoadForge stack, including the web app. **Do not start a second `pnpm dev`
process afterward.**

If existing local data must be preserved, use:

```bash
make start
```

Expected local endpoints:

```text
Web: http://localhost:3020
API: http://localhost:7878
```

Verify health semantics:

```bash
curl -fsS http://localhost:7878/api/health/live
curl -fsS http://localhost:7878/api/health/ready
curl -fsS http://localhost:7878/api/health
```

`/live` checks only the process. `/ready` and `/health` must reflect PostgreSQL and,
when configured, Redis readiness.

## 2. Browser contexts

Use independent contexts so participant storage/session state cannot leak between roles:

| Context | Purpose |
| --- | --- |
| Owner | synced roadmap owner |
| Editor | editor invite participant |
| Viewer | viewer invite participant |
| Local | roadmap that is never saved to the server |

Private/incognito windows or isolated browser profiles are acceptable.

## 3. Local-first flow

In the Local context:

- [ ] Create a blank roadmap without enabling server sync.
- [ ] Add a phase and tasks.
- [ ] Add an assignee and a tag.
- [ ] Add a dependency between tasks.
- [ ] Mark a task complete.
- [ ] Reload the page and confirm the roadmap survives from browser storage.
- [ ] Confirm collaboration-only Team/share controls are absent or accurately unavailable.
- [ ] Export JSON.
- [ ] Import that JSON as a new local roadmap and confirm the meaningful structure survives.
- [ ] Export Markdown and confirm it contains roadmap content but no credentials.

The user-facing experience must make it clear that browser storage is not a backup and
that important roadmaps should be exported as JSON.

## 4. Starter template

Create a roadmap from the bundled example.

- [ ] Exactly three phases are created.
- [ ] The phase names are `Define the outcome`, `Build and test`, and `Release and learn`.
- [ ] The example contains nine tasks.
- [ ] One task is marked next.
- [ ] Dependencies and tags are visible and understandable.
- [ ] The example feels like generic product planning, not RoadForge's internal backlog.

## 5. Promote local roadmap to server

In the Owner context:

- [ ] Create/edit a local roadmap first.
- [ ] Choose the explicit save/share action to enable server collaboration.
- [ ] Save without a password once.
- [ ] Confirm the workspace becomes synced/live without losing the local work.
- [ ] Confirm scoped roadmap and auth cache entries exist in browser storage.
- [ ] Confirm a JSON export remains available after promotion.

Repeat the save flow with a password-protected disposable roadmap and verify the password
gate during join.

## 6. Share links

As Owner:

- [ ] Open sharing controls.
- [ ] Owner/editor raw invite URLs are not recoverable from ordinary listing after the one-time response.
- [ ] Rotate the editor link and save the new URL temporarily for QA.
- [ ] Obtain/refresh the viewer link and save it temporarily for QA.
- [ ] Re-open sharing and verify owner/editor raw URLs are hidden.
- [ ] Verify the active viewer link remains intentionally copyable when the current product contract says it should be.

Destroy temporary QA invite URLs after the run. Never paste them into an issue or CI log.

## 7. Join and role authorization

Editor context:

- [ ] Join with the editor invite.
- [ ] Set a display name.
- [ ] Reach the editable workspace.
- [ ] Edit task content successfully.
- [ ] Confirm owner-only sharing/deletion controls are unavailable.

Viewer context:

- [ ] Join with the viewer invite.
- [ ] Reach the read-only workspace.
- [ ] Confirm task/phase mutations are unavailable.
- [ ] Confirm read-only tags/activity/roadmap content remain usable.
- [ ] Confirm a viewer can create an independent local copy when that action is offered.

The API must enforce these boundaries even when a control is hidden in the UI.

## 8. Participants and revocation

With owner, editor, and viewer active:

- [ ] Owner participant controls show the expected joined participants.
- [ ] Editor receives only the participant summary data intended for editors.
- [ ] Owner revokes the editor participant.
- [ ] The editor loses access without requiring a full browser restart.
- [ ] A subsequent editor API mutation fails authorization.
- [ ] Viewer remains unaffected.
- [ ] Rotate/revoke an invite and prove that future joins using the old link fail.
- [ ] Confirm invite rotation does not automatically revoke an already joined participant.

## 9. Realtime and reconnect

With two authorized editing contexts:

- [ ] Save a change in one context and observe the other refresh without manual reload.
- [ ] Acquire/release an edit lock and observe the other context's lock state.
- [ ] Interrupt the API/network temporarily and confirm status becomes offline/reconnecting rather than falsely live.
- [ ] Restore the API/network and confirm realtime reconnects.
- [ ] Verify unsaved local work is not overwritten by a reconnect refresh.

When validating Redis/multi-worker mode, use an actual Redis-backed deployment rather
than only in-memory test doubles.

## 10. Optimistic-concurrency conflict

Open the same editable roadmap in two independent contexts:

1. make distinct local edits in both;
2. save context A;
3. attempt to save the stale revision from context B.

Expected:

- [ ] context B receives a conflict rather than overwriting A;
- [ ] B's local edits remain available for review;
- [ ] conflict UI offers explicit recovery choices;
- [ ] accepting/reloading server state is deliberate;
- [ ] any explicit overwrite/restore path remains bound to the reviewed server revision and does not bypass a second concurrent change.

## 11. Activity and versions

- [ ] Routine edits create meaningful activity without duplicating autosync noise.
- [ ] Participant attribution uses collaboration labels without implying verified identity.
- [ ] Create a manual checkpoint.
- [ ] Make later changes.
- [ ] Editor can inspect permitted version history but cannot perform owner-only restore.
- [ ] Owner restores the checkpoint successfully.
- [ ] Restored tags, tasks, dependencies, and ordering match the checkpoint.

Do not describe activity as an immutable compliance ledger.

## 12. Import safety

Exercise:

- [ ] replace import;
- [ ] create-new-local import;
- [ ] safe-additions merge;
- [ ] supported historical schema import;
- [ ] malformed/invalid import.

Confirm:

- [ ] previews explain destructive effects before application;
- [ ] safe merge does not silently overwrite matched tasks/tag definitions;
- [ ] repairs/warnings are visible when applicable;
- [ ] invalid imports do not mutate the current roadmap;
- [ ] exported files contain no participant/session/invite/password data.

## 13. Accessibility and responsive behavior

In addition to the automated axe/Playwright coverage:

- [ ] keyboard-create/edit/delete flows work without a pointer;
- [ ] keyboard phase/task/tag reorder supports pickup, movement, drop, and Escape cancellation;
- [ ] focus returns sensibly after popovers, dialogs, and side panels close;
- [ ] visible focus is never clipped;
- [ ] 200% browser zoom/reflow does not create unreachable controls;
- [ ] narrow mobile viewport has no page-level horizontal overflow;
- [ ] reduced-motion preference removes non-essential movement;
- [ ] touch targets remain usable on a real touch device when available.

Before release, perform at least one real screen-reader smoke test on the supported
platform matrix and record the tool/browser combination used.

## 14. Browser storage failure

Use a browser/devtools setup that rejects or exhausts local storage writes.

- [ ] A failed local write produces a persistent visible warning.
- [ ] RoadForge does not claim the roadmap was durably saved.
- [ ] Existing in-memory work remains exportable where possible.

## 15. Payload ceiling

The supported RoadForge payload ceiling is 5 MiB across browser import, API request
middleware, and maintained nginx configuration.

- [ ] A valid request below the limit is accepted.
- [ ] An oversized request is rejected with `413` without exposing request contents.
- [ ] Proxy configuration does not impose an accidental smaller historical 512 KiB limit.

The 384 KiB autosync value in `docs/performance.md` is a performance budget, not the API
ceiling.

## 16. Hosted/demo messaging

On the public Anvilary deployment:

- [ ] users can tell the deployment is a demo/convenience service;
- [ ] the UI/docs advise exporting important work as JSON;
- [ ] nothing implies managed backup, guaranteed durability, or account recovery;
- [ ] synced deletion wording distinguishes soft deletion, final live-database purge, and backup retention;
- [ ] self-hosting and source links are discoverable.

## 17. Production CSP rollout and deployment smoke

For a new public deployment or meaningful Next.js/frontend runtime upgrade, first deploy
the **exact candidate revision** with:

```text
ROADFORGE_CSP_MODE=report-only
```

During the bounded observation period:

- [ ] HTTPS is valid.
- [ ] `/api/health/live` is 200.
- [ ] `/api/health/ready` is 200.
- [ ] `/api/health` behaves as the readiness alias.
- [ ] baseline security headers are present.
- [ ] the frontend emits exactly one `Content-Security-Policy-Report-Only` header and no conflicting proxy/Cloudflare CSP.
- [ ] the report-only `script-src` contains a per-response nonce and contains neither `unsafe-inline` nor production `unsafe-eval`.
- [ ] document HTML is `private, no-store` while static assets remain cacheable normally.
- [ ] create/share/join/revoke/conflict/realtime/import/export flows work through the actual proxy/tunnel.
- [ ] owner/editor/viewer contexts produce no unexpected CSP console reports.
- [ ] fonts, icons, images, manifest, downloads, dynamic colors/styles, API fetches, and SSE remain functional.
- [ ] access logs do not contain invite query strings or `Referer` values.

After the observation result is clean, change only the deployment mode to:

```text
ROADFORGE_CSP_MODE=enforce
```

Then verify again:

- [ ] the frontend now emits exactly one enforced `Content-Security-Policy` header and no report-only duplicate;
- [ ] page reloads produce different nonce values;
- [ ] production `script-src` still contains no `unsafe-inline` or `unsafe-eval`;
- [ ] the critical local/create/import/export/share/join/realtime flows still work;
- [ ] browser console contains no unexpected CSP violations.

If a legitimate RoadForge flow is reproducibly blocked, return the deployment to
`report-only` on the same build while fixing the specific directive/source. Do not add a
broad production script exception merely to pass QA.

## 18. Retention dry run

Against any candidate deployment that already contains synced data, run the retention
command in dry-run mode before release:

- [ ] record the emitted UTC `as_of` value and policy thresholds;
- [ ] counts are plausible for the deployment and contain no roadmap/user/token content;
- [ ] active/newly deleted roadmaps are not selected;
- [ ] no category unexpectedly saturates the configured batch limit without investigation;
- [ ] a current database backup exists before any planned destructive purge.

Do not run `--execute --confirm PURGE` merely as a release smoke test. Destructive retention
is an operator lifecycle action, not a mandatory release-candidate mutation.

## 19. Backup and restore proof

For a schema-sensitive release:

- [ ] create and checksum a PostgreSQL backup before migration;
- [ ] restore it into a uniquely named disposable database;
- [ ] confirm representative roadmap/participant/version/activity rows;
- [ ] confirm projection integrity/parity;
- [ ] remove only the disposable restore database.

Never test restore by overwriting the live RoadForge database.

## 20. Release record

Record:

```text
Candidate SHA:
Version: 0.1.0
Date:
Automated CI: PASS / FAIL
Manual local QA: PASS / FAIL
Deployed QA: PASS / FAIL / NOT RUN
CSP report-only observation: PASS / FAIL / NOT RUN
CSP enforcement verification: PASS / FAIL / NOT RUN
Retention dry-run: PASS / FAIL / NOT RUN
Screen-reader smoke:
Backup/restore proof:
Known accepted limitations:
Operator / reviewer:
```

A release is not certified by an older SHA's green run. Any accepted change after the
candidate is recorded requires rerunning the gates affected by that change.
