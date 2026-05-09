# RoadForge — MVP Manual Test Plan

This is a manual step-by-step test of the full create → save → share → join → revoke flow. Run after any change to the service layer, join page, or share modal.

---

## Prerequisites

1. Docker and Docker Compose installed and running.
2. `pnpm install` completed.
3. `.env.local` exists with `NEXT_PUBLIC_API_URL=http://localhost:7878`.

---

## Setup

```bash
# Terminal 1 — backend
docker compose up --build api postgres

# Wait for:
# api_1  | INFO: Application startup complete.

# Terminal 2 — frontend
pnpm dev

# Confirm both are running:
curl http://localhost:7878/api/health
# → {"status":"ok","version":"0.1.0"}
```

---

## 1. Create roadmap

1. Open `http://localhost:3000`.
2. Complete the wizard (any name, any roadmap title).
3. Confirm you reach the Workspace.

**Check:** Workspace header shows the roadmap name. Progress bar shows 0/N tasks done.

---

## 2. Save to backend

1. Click **Save** (or **Save to server**) in the app header.
2. Confirm the save modal appears. Click confirm.
3. Toast: "Saved · collaboration enabled".

**Check localStorage (`F12 → Application → Local Storage → localhost:3000`):**
- `rf:saved` = `true`
- `rf:serverRoadmapId` = a string starting with `rm_`
- `rf:sessionToken` = a string starting with `sess_`
- `rf:role` = `owner`

**Check backend:**
```bash
ROADMAP_ID=$(node -e "console.log(localStorage['rf:serverRoadmapId'])" 2>/dev/null || echo "check browser")
# Or copy from localStorage in DevTools, then:
curl http://localhost:7878/api/roadmaps/<rm_id> | python3 -m json.tool
```

---

## 3. Refresh page

1. Refresh `http://localhost:3000`.

**Expected behavior:** On refresh, the app hydrates immediately from `localStorage`. If `rf:serverRoadmapId` exists, `RoadmapContext` also calls `GET /api/roadmaps/{id}` in the background and replaces roadmap name, phases, and `ownerDisplayName` with the server snapshot. If the backend request fails, the app keeps the cached local state.

---

## 4. Open share modal

1. Click **Share** in the app header.
2. Confirm the modal loads three share links: Owner, Editor invite, Viewer (read-only).
3. All three show "Rotate to generate a copyable link" (url is null from the API).

---

## 5. Rotate editor link

1. Click **Regenerate** on the Editor row.
2. Confirm the editor row now shows a copyable URL starting with `http://localhost:3000/join?token=ed_`.
3. Toast: "New link generated — copy it now".
4. Click **Copy** on the editor row.
5. Confirm "Copied" state appears briefly.

---

## 6. Rotate viewer link

1. Click **Regenerate** on the Viewer row.
2. Confirm a viewer URL appears: `http://localhost:3000/join?token=vi_`.
3. Copy the viewer link for use in the next step.

---

## 7. Join as viewer (private window, no display name)

1. Open a private/incognito browser window.
2. Paste the viewer join URL.
3. Leave the display name field blank.
4. Click **Open roadmap**.

**Expected:**
- No password prompt (no password was set).
- Routed to `/shared` (viewer mode).
- Read-only banner visible.
- Roadmap name matches.

**Check localStorage in private window:**
- `rf:serverRoadmapId` — matches the roadmap ID
- `rf:role` = `viewer`
- `rf:sessionToken` = a `sess_` string
- `rf:participantId` = a `pt_` string

---

## 8. Join as editor (private window, with display name)

1. Open another private window (or clear the previous one's storage).
2. Paste the editor join URL.
3. Enter a display name, e.g. "Jordan".
4. Click **Open roadmap**.

**Expected:**
- Routed to `/workspace`.
- No viewer banner.
- `rf:role` = `editor` in localStorage.

---

## 9. Test authorization (bearer tokens)

1. **Owner:** Confirm you can rotate/revoke links in the main window.
2. **Editor:** In the editor private window, confirm that clicking "Save" (if you've made changes) succeeds. Confirm you cannot see "Share" or management tools reserved for the owner (if any are implemented).
3. **Viewer:** Confirm you cannot edit tasks or see management tools.

---

## 10. Test invalid token

1. In a private window, navigate to `http://localhost:3000/join?token=ed_fakefakefake`.
2. Click **Open roadmap**.

**Expected:** Error message: "This invite link is invalid or has expired."

---

## 11. Test missing token

1. Navigate to `http://localhost:3000/join` (no `?token=` param).

**Expected:** "Invalid invite link" screen with "Go home" button.

---

## 12. Revoke viewer link

1. Back in the main browser (owner session).
2. Open Share modal.
3. Click **Revoke** on the Viewer row.
4. Toast: "Link revoked".
5. Viewer row disappears from the list.

---

## 13. Confirm revoked link fails

1. In a private window, paste the viewer join URL from step 6.
2. Click **Open roadmap**.

**Expected:** Error message: "This invite link is invalid or has expired."

---

## 14. Test password-protected roadmap (UI flow)

1. Clear your local storage and start a new roadmap.
2. Click **Save to server**.
3. In the save modal, enter a password (e.g. `pass123`) in the optional password field.
4. Click **Confirm**.
5. Copy an editor join link from the Share modal.
6. Open the editor URL in a private window.
7. Click **Open roadmap** without a password.

**Expected:** Error: "This roadmap requires a password." Password field appears.

8. Enter `pass123` and click **Open roadmap** again.

**Expected:** Routed to `/workspace`.

---

## 14. Verify database rows (optional)

```bash
docker compose exec postgres psql -U roadforge -d roadforge -c "SELECT id, name FROM roadmaps;"
docker compose exec postgres psql -U roadforge -d roadforge -c "SELECT id, role, is_active FROM share_links;"
docker compose exec postgres psql -U roadforge -d roadforge -c "SELECT id, role, display_name FROM participants;"
docker compose exec postgres psql -U roadforge -d roadforge -c "SELECT action, actor_name FROM activity_logs ORDER BY created_at;"
```

---

## Validation checklist

- [ ] Roadmap creates and saves to backend
- [ ] `rf:serverRoadmapId`, `rf:sessionToken`, `rf:role` in localStorage after save
- [ ] Share modal loads links from backend
- [ ] Rotate returns a copyable URL
- [ ] Viewer join routes to `/shared`
- [ ] Editor join routes to `/workspace`
- [ ] Missing display name uses role default (check participants table)
- [ ] Invalid token shows error, does not crash
- [ ] Missing token shows invalid link screen
- [ ] Revoke removes link from share modal
- [ ] Revoked token returns error on join attempt
- [ ] Password-protected join prompts for password on first attempt
