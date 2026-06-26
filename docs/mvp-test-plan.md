# Anvilary Roadmaps — MVP Manual Test Plan

This is a manual step-by-step test of the full create → save → share → join → revoke flow. Run after any change to the service layer, join page, or share modal.

---

## Prerequisites

1. Docker and Docker Compose installed and running.
2. `pnpm install` completed.
3. `.env.local` exists with `NEXT_PUBLIC_API_URL=http://localhost:7878`.

---

## Setup

```bash
# Terminal 1 — clean start
make reset

# Wait for:
# api_1  | INFO: Application startup complete.

# Terminal 2 — frontend
pnpm dev

# Confirm both are running:
make status
curl http://localhost:7878/api/health
# → {"status":"ok","version":"0.1.0"}
```

---

## 1. Create roadmap

1. Open `http://localhost:3020`.
2. Complete the wizard:
   - Enter your name.
   - Enter a roadmap title.
   - **Choose a starting point:** Select **Start blank** (or **Use template** if testing with examples).
   - Review storage info.
3. Confirm you reach the Workspace.

**Check:** Workspace header shows the roadmap name. Progress bar shows 0/N tasks done (0/0 if blank).

---

## 2. Save to backend (with password)

1. Click **Save** in the app header.
2. In the Save modal, enter a password (e.g. `pass123`) in the optional password field.
3. Click confirm.
4. Toast: "Saved · collaboration enabled".

**Check localStorage/sessionStorage (`F12 → Application`):**
- `sessionStorage` `rf:activeRoadmapId` = a string starting with `rm_`
- `localStorage` `rf:roadmap:rm_...` = JSON object with phases
- `localStorage` `rf:auth:rm_...` = JSON object with role, sessionToken

---

## 3. Refresh page

1. Refresh `http://localhost:3020`.

**Expected behavior:** On refresh, the app hydrates immediately from scoped `localStorage` via the active ID in `sessionStorage`. `RoadmapContext` also calls `GET /api/roadmaps/{id}` in the background and replaces roadmap name, phases, and `ownerDisplayName` with the server snapshot.

**Schema upgrade check:** If the cached or server snapshot is from an older Anvilary Roadmaps shape, the client upgrades it before rendering. Local caches are written back, owner/editor synced roadmaps autosync the upgraded shape, and viewers upgrade in memory only.

---

## 4. Multi-Roadmap Isolation

1. **Tab A:** Keep the roadmap from Step 2 open.
2. **Tab B:** Open a new tab to `http://localhost:3020`. Create a new roadmap titled "Roadmap B" and save it.
3. **Tab A:** Refresh Tab A. It should still show the first roadmap.
4. **Tab B:** Refresh Tab B. It should still show Roadmap B.
5. **Check Storage:** `sessionStorage` in Tab A should hold the first ID, and Tab B should hold the second. `localStorage` should contain cache entries for both `rm_` IDs without overwriting each other.

---

## 5. Open share modal

1. Click **Share** in the app header.
2. Confirm the modal loads three share rows: Private owner link, Private editor invite, Public viewer link.
3. Owner/editor rows do not persistently expose raw URLs. Active viewer row can show a copyable public read-only URL.

---

## 5b. Rotate and copy links

1. Click **Rotate link** on the Editor row.
2. Confirm the editor row shows a copyable URL. Copy it.
3. Click **Generate** or **Reset link** on the Viewer row. Copy the viewer link.
4. Close and reopen Share. Confirm the editor URL is hidden again and the active viewer URL remains copyable.

---

## 6. Join as Viewer (Private Window)

1. Open a private browser window.
2. Paste the viewer join URL.
3. Leave display name blank. Click **Open roadmap**.

**Expected:**
- Password prompt appears (since we set one in Step 2).
- Enter `pass123` and click **Open roadmap**.
- Routed to `/shared` (viewer mode).
- Read-only banner visible.

---

## 7. Join as Editor (Private Window)

1. Open another private window.
2. Paste the editor join URL.
3. Enter display name "Jordan" and password `pass123`.
4. Click **Open roadmap**.

**Expected:**
- Routed to `/workspace`.
- No viewer banner.
- `rf:role` = `editor` in localStorage.

---

## 8. Real-time collaboration (Two-browser flow)

1. **Browser A (Owner):** Open a task (expand Task RF-01).
2. **Browser B (Editor):** Confirm Task RF-01 shows "Owner is editing" and the checkbox is disabled.
3. **Browser A:** Collapse the task.
4. **Browser B:** Confirm the lock badge disappears and task is editable.
5. **Browser B:** Toggle a task to 'done' and click **Save**.
6. **Browser A:** Confirm the task checkmark updates automatically (SSE sync).

---

## 9. Test Optimistic Concurrency (Conflict)

1. **Browser A:** Open a task detail.
2. **Browser B:** Open the same task detail (acquire lock).
3. **Browser B:** Make a change and click **Save**.
4. **Browser A:** Attempt to click **Save**.

**Expected:** Toast "This roadmap changed elsewhere — reload before saving" (409 Conflict).

---

## 10. Test link revocation

1. **Browser A (Owner):** Open Share modal and click **Revoke** on the Viewer row.
2. **Toast:** "Link revoked".
3. **Verification:** In a new private window, attempt to join with the old viewer URL.

**Expected:** Error: "This invite link is invalid or has expired."

---

## 11. Verify authorization (Bearer tokens)

1. **Editor:** Confirm you can edit and save tasks.
2. **Editor:** Confirm you cannot see "Share" or management tools reserved for the owner.
3. **Viewer:** Confirm you cannot edit tasks or see management tools.

## 11b. Verify Team and assignee separation

1. Add a task assignee that has not joined the roadmap.
2. Confirm that name appears as a task/person filter option.
3. As Owner, open **Team**. Confirm Team is a main workspace view and shows only joined server participants.
4. Confirm local-only roadmaps do not show Team/collaboration management.

---

## 12. Verify Activity Logs (Save-Level Summaries)

1. **Owner/Editor:** Open the **Activity** panel.
2. **Action:** Double-click the roadmap title, rename it, and save/autosync.
3. **Confirm Activity:** One new entry `Renamed roadmap` appears. Confirm Versions count does not increase from the rename alone.
4. **Action:** Complete the last unfinished task in a phase.
5. **Click Save.**
6. **Confirm Activity:** One new entry `Completed phase` appears with the phase number/name.
7. **Action:** Reopen a task in that completed phase and click Save.
8. **Confirm Activity:** One new entry `Reopened phase` appears.
9. **Action:** Add a task and click Save.
10. **Confirm Activity:** One new entry `Added task` appears with task ID/title.
11. **Action:** Import a JSON roadmap, then click Save.
12. **Confirm Activity:** One new entry `Imported roadmap` appears with phase/task counts.
13. **Action:** Make several meaningful changes before clicking Save.
14. **Confirm Activity:** One compact `Saved N changes` batch entry appears, not one row per local click.

---

## 13. Verify JSON import/export

1. Stop the backend if you want to verify local-only behavior.
2. Open a local unsaved roadmap.
3. Open **Import / Export**.
4. Export JSON and confirm a `.roadforge.json` file downloads.
5. Import that JSON — no notice appears (own clean export). Roadmap name and phases load.
6. Import a raw JSON phase array and confirm it loads.
7. Import invalid JSON and confirm the error toast says `Import failed: invalid JSON.`
8. Import a JSON with `"done": 1` on a task (integer instead of boolean) → **Import notice** appears: "Boolean task fields (done, next) were coerced from non-boolean values." Confirm → import proceeds.
9. Import a JSON with `"schema": "roadforge.roadmap.v0"` → Import notice appears with a compatibility warning. Confirm → import proceeds.

**Expected:** Import auto-repair handles minor structural issues (null/wrong-type fields, duplicate IDs, legacy assignment tags) before validation. Users see an Import notice listing what was fixed. Truly malformed or unrelated JSON still fails with a toast error.

## 14. Verify phase reorder numbering and schema upgrade notice

1. Drag phase `01` above phase `00`.
2. Confirm the moved phase now displays `00`, the next displays `01`, and phase IDs/tasks stayed with their phase.
3. Save, reload, and export JSON. Confirm `phase.num` values persist in visible order.
4. Load/import an old roadmap with missing/null task defaults.
5. Confirm **Roadmap updated for this version** appears with **Download backup**.
6. Confirm automatic upgrade does not create an Activity entry or version checkpoint.

---

## Validation checklist

- [ ] `make reset` starts clean
- [ ] Roadmap saves with password
- [ ] `rf:auth:rm_...` in localStorage contains `sessionToken` and `role`
- [ ] Share modal generates valid links
- [ ] Viewer join routes to `/shared` after password gate
- [ ] Editor join routes to `/workspace`
- [ ] Real-time SSE sync updates checkbox without refresh
- [ ] Soft lock prevents editing while another participant has task open
- [ ] 409 Conflict toast appears on stale save
- [ ] Revoke invalidates the link immediately
- [ ] Activity panel shows creation, updates, and joins correctly
- [ ] JSON export/import works without the backend running
- [ ] Public viewer link remains copyable after reopening Share
- [ ] Team view shows participants only, not task assignees
- [ ] Schema auto-upgrade notice and backup download work
