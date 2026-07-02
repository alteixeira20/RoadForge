# Anvilary Roadmaps — Manual QA Checklist

Dense pre-release checklist. Run top to bottom. Mark blockers immediately.

For a focused backend API smoke test (health, create, join, 403/401 checks, SSE, rate limit, migration drift), see [docs/backend-smoke-tests.md](backend-smoke-tests.md).

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
- [ ] Team button is hidden. No participant/collaborator management appears for this local-only roadmap.
- [ ] Add a phase. Add two tasks to it. Mark one done.
- [ ] Add an assignee named "Farreca" to one local task. Confirm Farreca appears only as a task/person filter option, not as a collaborator.
- [ ] Close and reopen the tab. Phase and tasks persist (localStorage).
- [ ] **Expected:** Everything loads from localStorage without an API call. No "Save" button shows a server ID.

---

## 2 — Server roadmap creation (Owner tab)

- [ ] Complete wizard → name "QA Roadmap" → use template/blank.
- [ ] Click **Save to server** in header.
- [ ] Save modal opens. Submit without a password (leave blank).
- [ ] Toast: "Saved · collaboration enabled".
- [ ] Header badge changes to **LIVE**.
- [ ] `localStorage` contains scoped entries: `rf:roadmap:rm_...` and `rf:auth:rm_...` with a session token and owner role.

---

## 3 — Sync state badge verification

- [ ] With server roadmap loaded, badge shows **LIVE**.
- [ ] Edit any task title (do not save yet) → badge shows **LOCAL** or equivalent unsaved indicator.
- [ ] Click Save → badge briefly shows **SYNCING**, then returns to **LIVE**.
- [ ] Kill Docker API (`make api-down`) while roadmap is loaded.
- [ ] Edit a task and click Save → badge shows **OFFLINE** and toast about failed save.
- [ ] Restart API (`make api-up`). Retry Save → succeeds, badge returns to **LIVE**.
- [ ] **Conflict test:** open same roadmap in a second tab. Save from tab 2 first, then try to save from tab 1 → badge shows **CONFLICT**, toast says local edits are preserved, and the conflict banner offers review plus reload fallback.

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
- [ ] Copy the viewer URL after reopening the modal and save it somewhere temporary. It should be the stable public read-only demo link for this roadmap.

---

## 5 — Join as Editor and Viewer

**Editor (private window):**
- [ ] Open editor link.
- [ ] Enter display name "Jordan". Submit (no password).
- [ ] Routed to `/workspace`. Workspace loads. No viewer banner.
- [ ] `rf:auth:rm_...` role = `editor` in localStorage.

**Viewer (second private window):**
- [ ] Open viewer link.
- [ ] Enter display name "Sam". Submit.
- [ ] Routed to `/shared`. Read-only banner visible.
- [ ] `rf:auth:rm_...` role = `viewer` in localStorage.
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
- [ ] A styled in-app confirm dialog appears (shared `ConfirmDialog`, not a native browser `confirm()` popup). It has a Cancel and a destructive confirm button. Press Escape or Cancel once to verify it dismisses without revoking, then reopen and confirm.
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
- [ ] **Markdown description:** use the toolbar or type paragraphs, bold, italic, inline code, links, bullet/numbered lists, and `- [ ]` / `- [x]` items → save → compact formatted content renders in the task detail.
- [ ] **Markdown safety:** enter `<b>raw HTML</b>` and a `vbscript:` link → raw HTML displays as text and the unsafe link is not clickable.
- [ ] **Legacy description:** load a plain-text description with line breaks → it remains readable without conversion.
- [ ] **Done:** Tick checkbox → phase progress bar updates → save → state persists.
- [ ] **Undone:** Untick → progress bar decrements → save → state persists.
- [ ] **Subtask:** Set `parentId` on a task (via edit form if wired) → renders indented under parent.
- [ ] **Dependency:** Add dep ID → appears in task detail.
- [ ] Editor can do all of the above. Viewer cannot (checkboxes disabled).

---

## 11b — Task claim and override (styled confirmation)

- [ ] Expand an incomplete task. The detail shows a **Work on this** claim button.
- [ ] Click **Work on this** → task shows a "Working on this" / "On it" claim pill; the button becomes **Stop working**.
- [ ] Click **Stop working** → claim clears.
- [ ] **In Editor window:** claim the same task as Jordan. Owner now sees "Jordan is working on this".
- [ ] As Owner (claim-override permitted role), an **Override claim** button appears next to Jordan's claim.
- [ ] Click **Override claim** → a styled in-app confirm dialog opens (shared `ConfirmDialog`, not a native `confirm()`), titled "Override claim?" with a destructive **Override claim** confirm button and a Cancel.
- [ ] Press Cancel or Escape → no change; Jordan keeps the claim.
- [ ] Reopen and confirm **Override claim** → claim transfers to the current user; the dialog shows "Please wait…" while the claim request is in flight.
- [ ] Viewer cannot claim or override (no claim controls in read-only mode).

---

## 11c — Tag Registry: delete unused tag (styled confirmation)

- [ ] Open the **Tag Registry** modal.
- [ ] A tag that is used by at least one task shows a usage count; its delete (✕) control is disabled with a "Cannot delete: used by N task(s)" tooltip. No confirm appears.
- [ ] For an **unused** tag, click its delete (✕) control → a styled in-app confirm dialog opens (shared `ConfirmDialog`, not a native `confirm()`), titled "Delete tag?" naming the tag, with a destructive **Delete tag** confirm button.
- [ ] Press Cancel or Escape → the tag remains.
- [ ] Reopen and confirm **Delete tag** → the unused tag is removed and the roadmap is marked unsaved (autosync/Save persists it).

---

## 12 — Task edit locks

- [ ] Owner expands a task → lock acquired. (Check Network tab: POST `.../locks/acquire`.)
- [ ] **In Editor window:** same task shows "Owner is editing" badge. Checkbox and edit inputs are disabled.
- [ ] Owner collapses task → lock released. Badge disappears in Editor window.
- [ ] Editor can now expand and edit the task.
- [ ] Lock expires automatically after ~30s of inactivity (verify by leaving task open but idle).

---

## 13 — Phase settings menu: color, modes, and lock

Color is no longer a bare swatch in the header. It opens from the phase **settings (···)** menu.

- [ ] Click the phase **settings (···)** button (Owner) → menu opens with **Rename**, **Change color**, and **Delete phase**.
- [ ] Click **Change color** → the color popover opens with **Auto** / **Manual** mode toggle.
- [ ] Repeat **Change color** with the phase expanded and collapsed → the popover stays open in both states.
- [ ] **Auto** mode: empty or zero-done phases are grey, partially complete phases are orange, and non-empty fully complete phases are green.
- [ ] A phase with no `colorMode` in legacy local/server/imported data upgrades to **Auto**; an explicit **Manual** mode and its color remain unchanged.
- [ ] Switch to **Manual** mode: a preset swatch grid appears plus a custom hex input with an **Apply** button.
- [ ] Pick a preset → phase header color updates immediately and the popover closes.
- [ ] Reopen, switch to Manual, type a valid `#rrggbb` hex → **Apply** enables → click it → color applies. Invalid hex keeps Apply disabled.
- [ ] **Self-lock does not flash the menu closed:** opening the settings menu / color popover acquires the current user's own phase lock, but the menu/popover stays open and is **not** replaced by a lock badge. The current user is never shown "… is editing" for their own lock.
- [ ] **In Editor window:** while Owner has the color popover open, the same phase shows a "<Owner> is editing" lock pill and the settings (···) menu is hidden for the editor.
- [ ] Owner closes the popover (outside click, selecting a color, or Escape) → lock releases → Editor's lock pill clears and the settings menu returns.
- [ ] Save → color persists after reload.
- [ ] **Delete phase confirmation:** open settings (···) → **Delete phase** → a styled in-app confirm dialog opens (shared `ConfirmDialog`, not a native `confirm()`), titled "Delete phase?", describing how many tasks/subtasks will be removed, with a destructive **Delete phase** confirm and a **Keep phase** cancel. Cancel/Escape keeps the phase; confirm removes it.
- [ ] Viewer sees no settings (···) menu and cannot change color (read-only).

---

## 14 — Phase drag-and-drop

- [ ] Drag a phase to a new position (drag handle appears on hover).
- [ ] Phases reorder immediately with animation.
- [ ] Phase display numbers are recomputed from the new order: first phase `00`, second `01`, third `02`, etc.
- [ ] Phase IDs and tasks stay with their moved phase.
- [ ] Save → reload → order persists.
- [ ] Export JSON after reorder and confirm phase `num` values match the visible order.
- [ ] With search/filter active → drag handle is hidden (disabled). No reordering while filtered.
- [ ] Viewer sees phases in correct order but no drag handles.

---

## 15 — Task filters

- [ ] Open filter dropdown. Options: All, Mine, Pair, Next, Open, Done (and person:Name options if assignees exist).
- [ ] **All:** all tasks visible.
- [ ] **Done:** only completed tasks visible.
- [ ] **Open:** only incomplete tasks visible.
- [ ] **Next:** only tasks marked `next` visible.
- [ ] **Mine/Pair:** requires assignees — tested in §16.
- [ ] Search bar: type a keyword → only matching task titles shown.
- [ ] Filter + search work together (AND logic).
- [ ] With active filter: phase drag handle hidden (cannot reorder).
- [ ] Clear filter → full list returns.

---

## 16 — Assignees, filters, and Team view

- [ ] Edit a task → add assignees (by name/handle).
- [ ] Assignee names appear on the task row.
- [ ] Filter dropdown shows person options derived only from assignees on the active roadmap's tasks.
- [ ] **Mine** filter: shows tasks where current participant's display name matches an assignee.
- [ ] Remove assignee from task → matching person filter option disappears after the active filter is cleared or reset.
- [ ] Owner opens synced roadmap → click **Team** in the toolbar.
- [ ] Team opens as a main workspace view, replacing the phase list until returning to Roadmap.
- [ ] Team shows actual server participants only: display name, role, access source, last seen, current-session marker.
- [ ] Owner can click Invite/Add team member and the existing Share modal opens.
- [ ] Owner can revoke a non-current participant from Team.
- [ ] Task assignees who have not joined through a share link do **not** appear as Team collaborators.
- [ ] Editor/viewer do not see owner-only Team management controls.

---

## 17 — Activity panel and anti-spam behavior

- [ ] Open **Activity** panel.
- [ ] Double-click the roadmap title, rename it, press Enter, then Save/autosync.
- [ ] Activity shows "Renamed roadmap"; Versions count does not increase from the rename alone.
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
- [ ] Markdown descriptions remain plain JSON strings, and each phase includes its `colorMode`.
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
- [ ] Import an older file with plain-text descriptions and no phase `colorMode` → descriptions render readably and phases use Auto colors.

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

## 21b — Schema auto-upgrade notice

- [ ] Seed/load an old local roadmap cache with `task.next: null` or missing `task.assignees`, `task.tags`, or `task.deps`.
- [ ] Open the roadmap. It loads without error and shows **Roadmap updated** near the workspace top.
- [ ] Notice copy says Anvilary updated the roadmap for the latest version. It does not show technical repair details or a backup/download button.
- [ ] Click **Dismiss**. The notice does not reappear for that active roadmap/session.
- [ ] Reload the local roadmap and confirm the cache has the repaired current shape.
- [ ] Load an old synced roadmap as owner/editor. It repairs, marks local state unsaved, and autosync persists the upgraded snapshot.
- [ ] Load an old synced roadmap as viewer. It repairs in memory for UI safety but does not attempt to save.
- [ ] Confirm automatic schema upgrade does not create an Activity entry or a version checkpoint.

---

## 22 — Version history

- [ ] Open **Versions** panel (owner only).
- [ ] After saving §11 edits: one "Updated" version entry appears.
- [ ] After importing §19: one "Imported" or "Updated" entry appears.
- [ ] Task tick/untick/tick cycle before save → still ONE version created on save (not one per toggle).
- [ ] Editor/viewer do not see Versions panel (owner-only UI).

---

## 23 — Manual checkpoint

- [ ] Owner opens Versions panel → click **Create checkpoint**.
- [ ] Toast: "Checkpoint created." A new "Checkpoint" entry appears in the list.
- [ ] Click **Create checkpoint** again immediately → toast: "Latest version already matches current roadmap." No duplicate entry.

---

## 24 — Restore version

- [ ] Owner opens Versions panel → click **Restore** on a previous version.
- [ ] A styled in-app confirm dialog appears (shared `ConfirmDialog`, not a native `confirm()`): "Restore this version? Current roadmap will be replaced for all collaborators."
- [ ] Toast: "Restored roadmap". Workspace reflects restored state.
- [ ] **In Editor/Viewer windows:** SSE `roadmap.updated` fires → both auto-reload to restored state.
- [ ] Activity panel shows "Restored" entry.
- [ ] Editor cannot restore (button absent or 403 if called via API).

---

## 25 — 409 conflict recovery

- [ ] Open roadmap in two Owner tabs (same session or two owner participants).
- [ ] Tab 2: save a change → success.
- [ ] Tab 1: save a different change → 409 toast says the roadmap changed elsewhere and local edits are preserved.
- [ ] Tab 1: conflict banner shows **Review conflict** and **Reload server version**.
- [ ] Click **Review conflict**. Panel shows server updated time, local unsynced state, server state, and name/phase/task differences.
- [ ] Click **Keep editing locally**. Panel closes, badge remains **CONFLICT**, and local unsynced edits remain visible.
- [ ] Reopen review and click **Keep my local version**. Save retries against the latest server timestamp, clears conflict on success, and Activity refreshes if open.
- [ ] Repeat conflict, then click **Reload server version**. A styled in-app confirm dialog (shared `ConfirmDialog`, not a native `confirm()`) appears before discarding local unsynced edits.
- [ ] Confirm reload. Tab 1 loads the server version. Local unsynced edits from tab 1 are discarded only after confirmation.
- [ ] If a 409 response has no structured metadata, the reload-only fallback still works.

---

## 26 — Mobile layout at 375px

Set browser devtools to 375×812 (iPhone SE / 13 mini):

- [ ] **No horizontal overflow** — no horizontal scrollbar on any page.
- [ ] Workspace header is a single compact row: brand mark, sync badge, spacer, primary action (Save/Share/Reload icon), More (···) button. No roadmap name in the header row.
- [ ] Roadmap name appears in the workspace `<h1>` below the header — it is **not** duplicated in the header.
- [ ] Tap the title edit button near the workspace `<h1>`; input opens, Enter/blur save a valid title, Escape cancels, empty title is rejected.
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
- [ ] Activity/Versions panels: full-width overlay; scrollable. Team remains a main workspace view when available.
- [ ] Join page: form fits without overflow.

---

## 27 — Theme-aware favicon

- [ ] OS/browser in **light mode**: browser tab shows light-background favicon.
- [ ] OS/browser in **dark mode**: browser tab shows dark-background favicon.
- [ ] Toggle OS theme while tab is open → favicon updates without reload.
- [ ] Check at both 16×16 and 32×32 sizes (browser zoom or devtools).

---

## 28 — Data safety

- [ ] **Import replace does not create a new roadmap:** after replacing, active `rf:auth:rm_...` still points to the same server roadmap. Only one entry in roadmap switcher for this roadmap.
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
- [ ] **Invalid Bearer token on PUT returns 401:** call `PUT /api/roadmaps/{id}` with a garbage Bearer token and a valid `last_updated_at` field → 401.

---

## 30 — Deployment verification

Run on hosting-bay (or a staging clone of the deploy setup):

- [ ] `git status --short` is clean on `main`.
- [ ] GitHub Actions CI is green for latest commit (Quality Gate + API Syntax Check jobs both pass).
- [ ] `make update` completes: git pull → build → up → migrate → ps all succeed.
- [ ] `make migrate` run standalone shows "Running upgrade" or "Already up to date."
- [ ] Confirm migration `0005_add_public_viewer_tokens.py` has been applied before testing persistent public viewer links.
- [ ] `make ps` shows `api` container as `Up`. No restart loops.
- [ ] `docker compose logs --tail=40 api` shows `Application startup complete.` No ERROR lines at startup.
- [ ] `curl https://roadforge.alexandreteixeira.dev/api/health` → `{"status":"ok","version":"0.1.0"}`.
- [ ] Confirm normal deployment uses `ROADFORGE_API_WORKERS=1`.
- [ ] Confirm any deployment with `ROADFORGE_API_WORKERS` greater than `1` also sets `ROADFORGE_REALTIME_BACKEND=redis`.
- [ ] Migration/schema drift check passes — run `make api-check` (requires running stack) or `alembic check` directly. Expect: `No new upgrade operations detected.`

---

## 30b — RF-886 multi-worker realtime regression checklist

Run this only in a local or staging stack where Redis-backed realtime is enabled.
Do not mark RF-823 production rollout complete until every item passes.

Environment preconditions:

```bash
ROADFORGE_REALTIME_BACKEND=redis
ROADFORGE_API_WORKERS=2
REDIS_URL=redis://<redis-host>:6379/0
```

Worker routing note: run the API with two workers and use access logs, container
logs, or a temporary load-balancer/session routing setup to confirm the "worker
A" and "worker B" references below really hit different processes. If worker
selection cannot be observed or controlled, this checklist is inconclusive.

- [ ] Open Owner and Editor/Viewer browser contexts against the same roadmap.
- [ ] Confirm `roadmap.updated` published by a request handled on worker A reaches an SSE client connected through worker B.
- [ ] Request an SSE ticket through worker A, then open `/events?ticket=...` through worker B. It succeeds once.
- [ ] Reuse the same ticket through either worker. It returns `401 Invalid or expired event ticket`.
- [ ] Wait more than 30 seconds before consuming a fresh ticket. It returns `401 Invalid or expired event ticket`.
- [ ] Acquire a task edit lock through worker A. `GET /locks` through worker B lists that lock.
- [ ] Attempt to acquire the same target as a different participant through worker B. It returns 409.
- [ ] Refresh the same participant's lock through worker B. The lock remains owned by that participant and its TTL extends.
- [ ] Release a lock acquired on worker A through worker B as the same participant. Other connected clients receive `lock.released`.
- [ ] Attempt lock release as a different participant. The lock remains active until owner release or TTL expiry.
- [ ] Trigger configured rate limits with requests split across both workers. The combined attempts return `429` at the same effective limit as one worker.
- [ ] Confirm `Retry-After` remains present and the 429 body remains `{"detail":"Too many requests. Try again later."}`.
- [ ] Revoke a participant through worker A. The revoked participant's SSE stream on worker B receives `participant.revoked`.
- [ ] Delete a roadmap through worker A. Active Editor/Viewer SSE streams on worker B receive `roadmap.deleted`.
- [ ] Force an SSE disconnect, then reconnect through the normal ticket-renewal flow. Realtime resumes without frontend changes.
- [ ] Restart or stop Redis during the staging session and record behavior:
  tickets and locks fail closed/degraded, Pub/Sub delivery is interrupted,
  reconnect requires Redis recovery, and rate limiting may fail open per policy.
- [ ] Restore Redis and confirm new tickets, locks, rate limits, and SSE streams recover without switching to memory fallback.
- [ ] Reset to `ROADFORGE_API_WORKERS=1` before returning the environment to ordinary use unless this was an approved multi-worker rollout.

---

## 31 — Security hardening smoke checklist

Use this checklist after migrations, backend checks, frontend checks, and a local
or staging stack are available. Do not mark these as complete until you run them.

- [ ] New owner and joined participant sessions receive `session_expires_at`.
- [ ] Valid authenticated API requests renew `session_expires_at` by 30 days and update `last_seen_at` when the participant presence timestamp is stale.
- [ ] Expired participant session returns `401` with `{"detail":"Session expired"}` and does not create activity logs.
- [ ] Expired frontend session clears only `rf:auth:<roadmapId>`, preserves `rf:roadmap:<roadmapId>`, marks the local copy unsynced, and tells the user to rejoin through an active invite link.
- [ ] Revoked participant behavior is unchanged: existing session fails, `participant.revoked` copy remains owner/action language, and the local roadmap cache remains.
- [ ] Share-link revoke/rotate behavior is unchanged: future joins with the old link fail, existing participant sessions are not kicked.
- [ ] Wrong password attempts eventually return `429` with `Retry-After`.
- [ ] Invalid-token join attempts and roadmap creation are rate-limited by client IP.
- [ ] Event ticket requests allow normal page load/reconnect, then repeated direct calls return `429`.
- [ ] Owner share rotate/revoke works normally, then rapid repeated calls return `429`.
- [ ] CSP is Report-Only and does not block app load, save, join, import/export, fonts, icons, or SSE.
- [ ] Realtime SSE still works after the header changes.
- [ ] Sensitive roadmap API JSON responses include `Cache-Control: no-store`.
- [ ] API responses include `X-Content-Type-Options: nosniff`.

---

## 32 — Modal keyboard accessibility (focus trap)

All overlays built on the shared `Modal` (Save, Share, Import/Export, Tag Registry, and every `ConfirmDialog`) trap keyboard focus. Verify on at least the Share modal and one `ConfirmDialog`.

- [ ] Open the modal. Focus moves into the dialog (the dialog or its first control), not left behind on the page underneath.
- [ ] Press **Tab** repeatedly → focus cycles only through controls inside the modal and wraps from the last focusable control back to the first. It never lands on page content behind the scrim.
- [ ] Press **Shift+Tab** from the first control → focus wraps backward to the last control inside the modal.
- [ ] Press **Escape** → the modal closes.
- [ ] After the modal closes (via Escape, the ✕ button, or completing the action), focus returns to the element that opened it (e.g. the Share/Save trigger button).
- [ ] Repeat the Tab/Shift+Tab/Escape checks on a `ConfirmDialog` (e.g. delete unused tag from §11c or override claim from §11b): Tab cycles between Cancel and the confirm button, and focus returns to the triggering control after close.

---

## Blocker criteria

Stop QA and file a blocker if any of the following are true:

- Health check returns non-200 after `make update`.
- Any route (/, /workspace, /shared, /join) fails to load or throws a JS error.
- Save to server fails with an unrecoverable error (not 409).
- Join fails with a valid, non-revoked invite link.
- SSE events (roadmap.updated, participant.revoked, roadmap.deleted) do not fire within 5 seconds under normal conditions.
- Any multi-worker deployment runs with `ROADFORGE_REALTIME_BACKEND=memory` or without Redis connectivity.
- RF-886 multi-worker checks cannot prove cross-worker routing.
- 409 conflict recovery leaves the UI in a broken/unrecoverable state or discards local edits without explicit confirmation.
- Any exported JSON contains session tokens, invite tokens, or passwords.
- Import replace changes the `serverRoadmapId` stored in localStorage.
- Participant revoke does not reflect within 5 seconds in the revoked participant's window.
- Horizontal overflow at 375px on any primary route.
- CI fails on `main` (either job).

---

## Known acceptable limitations

- **No CRDT / three-way merge.** Conflict recovery (§25) offers structured review, keep-local retry, and reload-server fallback. It does not automatically merge fields or silently discard local edits.
- **Memory backend is single-worker only.** Running multiple Uvicorn workers with `ROADFORGE_REALTIME_BACKEND=memory` would break realtime features. Container startup refuses that configuration. Multi-worker mode requires `ROADFORGE_REALTIME_BACKEND=redis` and successful RF-886 validation.
- **No accounts / OAuth.** Session tokens in localStorage are the auth primitive. There is no login page, no password reset, and no user dashboard.
- **Link revoke does not kick active participants.** Revoking a share link prevents new joins via that link but does not terminate existing sessions. To remove an active participant, use participant revoke (§7).
- **Password gate not enforced on existing sessions.** A participant who already holds a session token is not re-prompted if the owner later enables a password.
- **Rate limiting is backend-dependent.** The limiter is shared across workers only with `ROADFORGE_REALTIME_BACKEND=redis`. Memory-backed rate limiting is single-worker only.
- **CSP is report-only.** Content Security Policy is observable but not enforced yet. Do not treat report-only CSP as blocking protection.
