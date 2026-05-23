# RoadForge — Manual QA Checklist

Dense pre-release checklist. Run top to bottom. Mark blockers immediately.

---

## Pre-flight

```bash
make reset                        # Wipe DB, rebuild images, start API + Postgres
make check                        # lint + typecheck + build — must be clean
curl http://localhost:7878/api/health
# → {"status":"ok","version":"0.1.0"}
pnpm dev                          # Start frontend (localhost:3020)
```

---

## Setup

Open four browser contexts and keep them active throughout:

| Label | Context | Starting URL |
|---|---|---|
| **Owner** | Main browser, tab A | `http://localhost:3020` |
| **Editor** | Private window | Join via editor link (generated in §4) |
| **Viewer** | Second private window | Join via viewer link (generated in §4) |
| **Local** | Main browser, tab B | `http://localhost:3020` (new roadmap, never saved to server) |

---

## 1 — Local roadmap (tab B)

- [ ] Complete wizard → name "Local QA Roadmap" → start blank.
- [ ] Workspace loads. Roadmap name appears in header. No sync badge visible (local state = LOCAL).
- [ ] Add a phase. Add two tasks to it. Mark one done.
- [ ] Close and reopen the tab. Phase and tasks persist (localStorage).
- [ ] **Expected:** Everything loads from localStorage without an API call. No "Save" button shows a server ID.

---

## 2 — Server roadmap creation (Owner tab)

- [ ] Complete wizard → name "QA Roadmap" → use template/blank.
- [ ] Click **Save to server** in header.
- [ ] Save modal opens. Submit without a password (leave blank).
- [ ] Toast: "Saved · collaboration enabled".
- [ ] Header badge changes to **LIVE**.
- [ ] `localStorage` contains `rf:serverRoadmapId` = `rm_...` and `rf:sessionToken` = `sess_...`.

---

## 3 — Sync state badge verification

- [ ] With server roadmap loaded, badge shows **LIVE**.
- [ ] Edit any task title (do not save yet) → badge shows **LOCAL** or equivalent unsaved indicator.
- [ ] Click Save → badge briefly shows **SYNCING**, then returns to **LIVE**.
- [ ] Kill Docker API (`make api-down`) while roadmap is loaded.
- [ ] Edit a task and click Save → badge shows **OFFLINE** and toast about failed save.
- [ ] Restart API (`make api-up`). Retry Save → succeeds, badge returns to **LIVE**.
- [ ] **Conflict test:** open same roadmap in a second tab. Save from tab 2 first, then try to save from tab 1 → badge shows **CONFLICT**, toast: "This roadmap changed elsewhere — reload before saving." Clicking the toast/button reloads from server and discards tab 1 local edits.

---

## 4 — Share modal (Owner)

- [ ] Click **Share**. Modal opens.
- [ ] Three role rows visible: Private owner link, Private editor invite, Public viewer link.
- [ ] Owner/editor active links do not reveal raw URLs after fetch.
- [ ] Public viewer link explains that anyone with the link can view read-only.
- [ ] Click **Rotate link** on Editor row → URL appears. Copy it (editor link).
- [ ] Click **Reset link** or **Generate public link** on Viewer row → URL appears. Copy it (viewer link).
- [ ] Owner row: only shows current session info; no join URL exposed.
- [ ] Close and reopen Share modal. Editor row shows "Active link" but NOT the raw URL. Viewer row still shows a copyable public read-only URL.

---

## 5 — Join as Editor and Viewer

**Editor (private window):**
- [ ] Open editor link.
- [ ] Enter display name "Jordan". Submit (no password).
- [ ] Routed to `/workspace`. Workspace loads. No viewer banner.
- [ ] `rf:role` = `editor` in localStorage.

**Viewer (second private window):**
- [ ] Open viewer link.
- [ ] Enter display name "Sam". Submit.
- [ ] Routed to `/shared`. Read-only banner visible.
- [ ] `rf:role` = `viewer` in localStorage.
- [ ] Task checkboxes are disabled. Share/Save buttons absent.

---

## 6 — Participant list and share-link usage tracking

- [ ] Owner opens Share modal → each role section shows a "Participants" sub-list.
- [ ] Jordan appears under Editor section with display name, join date, last-seen date.
- [ ] Sam appears under Viewer section.
- [ ] `Access source` label shows the link that was used to join (not "Legacy / unknown link").
- [ ] "Current session" badge appears on the Owner's own participant row.

---

## 7 — Participant revoke

- [ ] Owner clicks **Revoke** next to Jordan (Editor participant).
- [ ] Confirm dialog. Confirm.
- [ ] Jordan's row disappears from the participant list.
- [ ] **In Editor window:** toast "Your access was revoked." appears. Workspace goes read-only or prompts to leave.
- [ ] Editor attempts to save → 401/403 error; save fails.
- [ ] Viewer (Sam) is unaffected — still sees roadmap.

---

## 8 — Link revoke / rotate / generate

**Revoke viewer link:**
- [ ] Owner opens Share modal → Viewer row → click **Revoke**.
- [ ] Toast: "Link revoked". Row shows "No active link".
- [ ] Open the old viewer URL in a new private window → error: "This invite link is invalid or has expired."
- [ ] Sam (already joined Viewer) is **not** revoked — still connected.

**Rotate editor link:**
- [ ] Owner clicks **Rotate link** on Editor row → new URL generated.
- [ ] Old editor URL no longer works in a new private window.
- [ ] New editor URL works and routes to `/workspace`.

**Generate (from no-link state):**
- [ ] After revoking Viewer link, click **Generate** on Viewer row → new URL appears. Confirm it works.

---

## 9 — Realtime: roadmap.updated

- [ ] Owner adds a task and saves.
- [ ] **In Viewer window (Sam):** Roadmap auto-updates — new task appears without manual refresh.
- [ ] **In Editor window (Jordan, or re-join as new editor):** Same auto-update behavior.

---

## 10 — Realtime: roadmap.deleted

_(Requires a DELETE endpoint trigger — currently owner-only via API/docs if no UI button exists)_
- [ ] If a delete endpoint is wired in the UI: trigger deletion as Owner.
- [ ] **In active Editor/Viewer windows:** toast "This roadmap was deleted." appears.
- [ ] If only accessible via `/api/docs`: call `DELETE /api/roadmaps/{id}` with Bearer token, then confirm toast fires in other tabs.

---

## 11 — Task creation / editing / done state

- [ ] **Create:** Add task → task appears with unique ID.
- [ ] **Edit:** Expand task → change title, description, estimate, tags, assignees, deps → save → values persist after reload.
- [ ] **Done:** Tick checkbox → phase progress bar updates → save → state persists.
- [ ] **Undone:** Untick → progress bar decrements → save → state persists.
- [ ] **Subtask:** Set `parentId` on a task (via edit form if wired) → renders indented under parent.
- [ ] **Dependency:** Add dep ID → appears in task detail.
- [ ] Editor can do all of the above. Viewer cannot (checkboxes disabled).

---

## 12 — Task edit locks

- [ ] Owner expands a task → lock acquired. (Check Network tab: POST `.../locks/acquire`.)
- [ ] **In Editor window:** same task shows "Owner is editing" badge. Checkbox and edit inputs are disabled.
- [ ] Owner collapses task → lock released. Badge disappears in Editor window.
- [ ] Editor can now expand and edit the task.
- [ ] Lock expires automatically after ~30s of inactivity (verify by leaving task open but idle).

---

## 13 — Phase color picker and color lock

- [ ] Click phase color swatch (Owner) → color picker opens.
- [ ] **In Editor window:** same phase shows "X is editing" color lock badge. Color swatch is disabled.
- [ ] Owner closes picker → lock releases → Editor's badge clears.
- [ ] Owner picks a new color → phase header updates immediately.
- [ ] Save → color persists after reload.
- [ ] Viewer cannot open color picker (read-only).

---

## 14 — Phase drag-and-drop

- [ ] Drag a phase to a new position (drag handle appears on hover).
- [ ] Phases reorder immediately with animation.
- [ ] Save → reload → order persists.
- [ ] With search/filter active → drag handle is hidden (disabled). No reordering while filtered.
- [ ] Viewer sees phases in correct order but no drag handles.

---

## 15 — Task filters

- [ ] Open filter dropdown. Options: All, Mine, Pair, Next, Open, Done (and person:Name options if assignees exist).
- [ ] **All:** all tasks visible.
- [ ] **Done:** only completed tasks visible.
- [ ] **Open:** only incomplete tasks visible.
- [ ] **Next:** only tasks marked `next` visible.
- [ ] **Mine/Pair:** requires assignees — tested in §17.
- [ ] Search bar: type a keyword → only matching task titles shown.
- [ ] Filter + search work together (AND logic).
- [ ] With active filter: phase drag handle hidden (cannot reorder).
- [ ] Clear filter → full list returns.

---

## 16 — First-class assignees and Team panel

- [ ] Edit a task → add assignees (by name/handle).
- [ ] Assignee names appear on the task row.
- [ ] Open **Team** panel → shows all unique assignees extracted from tasks.
- [ ] Click an assignee in Team panel → filter switches to `person:<name>` — only that person's tasks shown.
- [ ] **Mine** filter: shows tasks where current participant's display name matches an assignee.
- [ ] Remove assignee from task → Team panel updates on next open.

---

## 17 — Activity panel and anti-spam behavior

- [ ] Open **Activity** panel.
- [ ] Complete one task → Save → one activity entry appears (e.g., "Completed task RF-101").
- [ ] Immediately uncheck and recheck the same task several times before saving → Save → still ONE consolidated entry (anti-spam deduplication), not one per tick.
- [ ] Add a new task → Save → "Added task RF-..." entry appears.
- [ ] Complete the last task in a phase → Save → "Completed phase 01" entry appears.
- [ ] Reorder phases → Save → "Reordered phases" entry appears.
- [ ] Make >5 diverse edits before saving → Save → single "Saved N changes" batch entry, not N rows.
- [ ] Rotate a share link → "Rotated editor link" appears in activity.
- [ ] Revoke a share link → "Revoked viewer link" appears.
- [ ] Revoke a participant → "Revoked participant" appears.

---

## 18 — Export JSON

- [ ] Open **Import / Export** → Export tab.
- [ ] Click **Export JSON** → `.roadforge.json` file downloads.
- [ ] Inspect file: contains `"schema": "roadforge.roadmap.export"`, `"version": 1`, phases, tasks.
- [ ] **No session tokens, invite tokens, or auth data** in the exported file.
- [ ] Re-import that same file (§19) → no compatibility warning (known schema/version).

---

## 19 — Import: replace current roadmap

- [ ] Open **Import / Export** → Import tab.
- [ ] Click **Replace current roadmap** → select the `.roadforge.json` file from §18.
- [ ] No notice shown (clean format, own export). Roadmap phases replace current phases immediately.
- [ ] **Server roadmap:** toast "Roadmap replaced — syncing after autosave". ID, session, switcher entry unchanged.
- [ ] Save → server reflects imported data.
- [ ] **Viewer cannot** use "Replace current roadmap" (button disabled).
- [ ] Import a file with an old/unknown schema → **Import notice** appears listing the compatibility warning → click "Replace current roadmap" → import proceeds.
- [ ] Import a file with auto-repaired issues (see §21) → **Import notice** appears listing what was repaired → confirm → roadmap loads.

---

## 20 — Import: new local roadmap

- [ ] With server roadmap active (Owner), click **Import as new local roadmap**.
- [ ] Select any `.roadforge.json` file.
- [ ] Toast: "Imported as new local roadmap".
- [ ] URL changes to `?roadmap=<new-local-id>`.
- [ ] New roadmap appears in roadmap switcher.
- [ ] **Collaborators (Editor, Viewer) are unaffected** — they still see the original server roadmap.
- [ ] Switch back to server roadmap via switcher → original data intact.

---

## 21 — Import compatibility warnings and auto-repair

**Compatibility warnings** (schema/version issues — shown when valid but non-canonical format):
- [ ] Create a JSON file with `"schema": "roadforge.roadmap.v0"` (unknown schema) and valid phases.
- [ ] Import it → **Import notice** appears with the compatibility warning. "This file will still import successfully." shown. Confirm → roadmap loads.
- [ ] Create a JSON file with `"version": 99` (future version) → warning: "This file was created with a newer version..."
- [ ] Create a file with an extra unknown field on a task (`"foo": "bar"`) → "Some fields in this file are not supported..."
- [ ] Import own exported file (§18) → **no notice at all** (clean schema, version 1, no unknown fields).

**Auto-repair** (safe structural fixes applied silently before validation):
- [ ] Create a JSON with a task where `"done": 1` (integer, not boolean) → Import notice lists "Boolean task fields (done, next) were coerced from non-boolean values."
- [ ] Create a JSON with a task where `"tags": null` → Import notice lists "Null values on optional fields were cleared."
- [ ] Create a JSON with a task where `"tags": "planning"` (string, not array) → Import notice lists "Non-array fields (tags, deps, assignees, or tasks) were replaced with empty arrays."
- [ ] Create a JSON with two tasks sharing the same `id` → Import notice lists "Duplicate task IDs were renamed to be unique."
- [ ] Create a JSON with a task `"parentId"` referencing a non-existent task ID → Import notice lists "parentId references to non-existent tasks were removed."
- [ ] Create a JSON with a task using legacy assignment tags (`"tags": ["owner:Alice"]`) → Import notice lists "Assignment tags (owner:, review:) were migrated to the assignees field."
- [ ] In all auto-repair cases: confirm import → roadmap loads with repaired data.
- [ ] **Truly malformed input** (not a JSON object/array, `{}` with no phases key, garbage text) → hard failure toast "Import failed: …". No notice panel shown.

---

## 22 — Version history

- [ ] Open **Versions** panel (owner or editor with access).
- [ ] After saving §11 edits: one "Updated" version entry appears.
- [ ] After importing §19: one "Imported" or "Updated" entry appears.
- [ ] Task tick/untick/tick cycle before save → still ONE version created on save (not one per toggle).
- [ ] Viewer does not see Versions panel (owner-only UI).

---

## 23 — Manual checkpoint

- [ ] Owner opens Versions panel → click **Create checkpoint**.
- [ ] Toast: "Checkpoint created." A new "Checkpoint" entry appears in the list.
- [ ] Click **Create checkpoint** again immediately → toast: "Latest version already matches current roadmap." No duplicate entry.

---

## 24 — Restore version

- [ ] Owner opens Versions panel → click **Restore** on a previous version.
- [ ] Confirm dialog: "Restore this version? Current roadmap will be replaced for all collaborators."
- [ ] Toast: "Restored roadmap". Workspace reflects restored state.
- [ ] **In Editor/Viewer windows:** SSE `roadmap.updated` fires → both auto-reload to restored state.
- [ ] Activity panel shows "Restored" entry.
- [ ] Editor cannot restore (button absent or 403 if called via API).

---

## 25 — 409 conflict recovery

- [ ] Open roadmap in two Owner tabs (same session or two accounts).
- [ ] Tab 2: save a change → success.
- [ ] Tab 1: save a different change → 409 toast: "This roadmap changed elsewhere — reload before saving."
- [ ] Tab 1: click the toast action / reload button.
- [ ] Tab 1: loads server version. Local unsaved edits from tab 1 are discarded (expected — no merge UI).

---

## 26 — Mobile layout at 375px

Set browser devtools to 375×812 (iPhone SE / 13 mini):

- [ ] **No horizontal overflow** — no horizontal scrollbar on any page.
- [ ] Workspace header is a single compact row: brand mark, sync badge, spacer, primary action (Save/Share/Reload icon), More (···) button. No roadmap name in the header row.
- [ ] Roadmap name appears in the workspace `<h1>` below the header — it is **not** duplicated in the header.
- [ ] More (···) menu button is tappable (≥36px touch target). Tapping opens a panel with: Import/Export, Theme toggle, Roadmap switcher.
- [ ] More menu closes on outside tap and on Escape.
- [ ] Save / Share / Reload primary action remains visible as a compact icon button (≥36px) in the header row without opening More.
- [ ] Search bar stretches full width.
- [ ] Filter dropdown opens without off-screen clipping.
- [ ] Phase list renders correctly. Phase status badge hidden.
- [ ] Phase drag handle visible and usable on touch.
- [ ] Task rows readable — no text clipped or overflowing card edges.
- [ ] **Share modal:** fits within viewport. Footer buttons wrap if needed. Participant rows wrap.
- [ ] **IO modal:** fits within viewport. Import/export action buttons readable.
- [ ] **Save modal:** readable and submittable.
- [ ] Activity/Versions/Team panels: full-width overlay; scrollable.
- [ ] Join page: form fits without overflow.

---

## 27 — Theme-aware favicon

- [ ] OS/browser in **light mode**: browser tab shows light-background favicon.
- [ ] OS/browser in **dark mode**: browser tab shows dark-background favicon.
- [ ] Toggle OS theme while tab is open → favicon updates without reload.
- [ ] Check at both 16×16 and 32×32 sizes (browser zoom or devtools).

---

## 28 — Data safety

- [ ] **Import replace does not create a new roadmap:** after replacing, `rf:serverRoadmapId` is unchanged. Only one entry in roadmap switcher for this roadmap.
- [ ] **Import as local does not affect collaborators:** Editor/Viewer windows show original server data; only the importer's tab switches to the new local roadmap.
- [ ] **Versions do not spam:** 10 task ticks before one save → activity shows max one new version entry, not 10.
- [ ] **Checkpoint idempotent:** double-clicking Checkpoint does not create duplicate entries.
- [ ] **Restore broadcasts:** after restore, Editor window auto-syncs without manual reload.

---

## 29 — Access and security

- [ ] **Revoked participant cannot save:** After being revoked (§7), Editor's save attempt returns 401/403.
- [ ] **Link revoke does not kick existing participants:** revoking Viewer link (§8) leaves Sam's active session alive.
- [ ] **Editor cannot see Share management panel:** Share modal either absent from toolbar or omits rotate/revoke controls for editor role.
- [ ] **Viewer cannot see Share or Save:** both controls absent in `/shared` route.
- [ ] **Editor cannot access Versions endpoints:** Versions panel absent or restricted; direct API call `POST /api/roadmaps/{id}/versions/checkpoint` with editor Bearer token returns 403.
- [ ] **Old invite token fails after rotate:** rotating editor link invalidates the previous URL immediately.
- [ ] **Invalid Bearer token on PUT returns 401:** call `PUT /api/roadmaps/{id}` with a garbage Bearer token → 401.

---

## 30 — Deployment verification

Run on hosting-bay (or a staging clone of the deploy setup):

- [ ] `git status --short` is clean on `main`.
- [ ] GitHub Actions CI is green for latest commit (Quality Gate + API Syntax Check jobs both pass).
- [ ] `make update` completes: git pull → build → up → migrate → ps all succeed.
- [ ] `make migrate` run standalone shows "Running upgrade" or "Already up to date."
- [ ] `make ps` shows `api` container as `Up`. No restart loops.
- [ ] `docker compose logs --tail=40 api` shows `Application startup complete.` No ERROR lines at startup.
- [ ] `curl https://roadforge.alexandreteixeira.dev/api/health` → `{"status":"ok","version":"0.1.0"}`.
- [ ] Confirm API container is running with exactly **one worker** (`--workers 1` in CMD; verify via `docker inspect`).

---

## Blocker criteria

Stop QA and file a blocker if any of the following are true:

- Health check returns non-200 after `make update`.
- Any route (/, /workspace, /shared, /join) fails to load or throws a JS error.
- Save to server fails with an unrecoverable error (not 409).
- Join fails with a valid, non-revoked invite link.
- SSE events (roadmap.updated, participant.revoked, roadmap.deleted) do not fire within 5 seconds under normal conditions.
- 409 conflict recovery leaves the UI in a broken/unrecoverable state.
- Any exported JSON contains session tokens, invite tokens, or passwords.
- Import replace changes the `serverRoadmapId` stored in localStorage.
- Participant revoke does not reflect within 5 seconds in the revoked participant's window.
- Horizontal overflow at 375px on any primary route.
- CI fails on `main` (either job).

---

## Known acceptable limitations

- **No CRDT / merge UI.** Conflict recovery (§25) reloads the server version and discards local edits. There is no three-way merge. This is expected behavior, not a bug.
- **Single API worker required.** `lock_service`, `event_bus`, and `ticket_service` are in-memory singletons. Running multiple Uvicorn workers would break realtime features. `--workers 1` is mandatory and is set in the Dockerfile CMD.
- **No accounts / OAuth.** Session tokens in localStorage are the auth primitive. There is no login page, no password reset, and no user dashboard.
- **Link revoke does not kick active participants.** Revoking a share link prevents new joins via that link but does not terminate existing sessions. To remove an active participant, use participant revoke (§7).
- **Password gate not enforced on existing sessions.** A participant who already holds a session token is not re-prompted if the owner later enables a password.
- **No rate limiting.** Invite token brute-force is not throttled in the current MVP.
- **No CSP.** Content Security Policy is deferred. Do not deploy publicly at scale without it.
