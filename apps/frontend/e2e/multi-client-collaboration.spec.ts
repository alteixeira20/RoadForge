import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { createRoadmap } from './helpers'

const screenshotDir = resolve(process.cwd(), '../../docs/agent-handoffs/screenshots')

interface SharedRoadmapFixture {
  ownerContext: BrowserContext
  ownerPage: Page
  editorContext: BrowserContext
  editorPage: Page
  serverRoadmapId: string
  inviteUrl: string
}

function trackAggregatePuts(page: Page, puts: string[]) {
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().match(/\/api\/roadmaps\/rm_[^/]+$/)) {
      puts.push(`${req.method()} ${req.url()}`)
    }
  })
}

async function ensurePhaseExpanded(page: Page, phaseIndex = 0) {
  const phase = page.locator('.phase').nth(phaseIndex)
  const isExpanded = await phase.evaluate((el) => el.classList.contains('expanded'))
  if (!isExpanded) {
    await phase.getByRole('button', { name: /Expand phase/i }).click()
  }
  return phase
}

async function setupSharedRoadmap(browser: Browser): Promise<SharedRoadmapFixture> {
  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()

  await createRoadmap(ownerPage, {
    title: 'Deterministic Multi-Client Roadmap',
    startingPoint: 'template',
  })

  // Owner enables sharing (saves to server)
  const enableShareBtn = ownerPage.locator('.header-save-btn', { hasText: 'Share' })
  await expect(enableShareBtn).toBeVisible()
  await enableShareBtn.click()

  const saveModal = ownerPage.getByRole('dialog', { name: 'Enable sharing' })
  await expect(saveModal).toBeVisible()
  const confirmSaveBtn = saveModal.getByRole('button', { name: /Enable sharing/i })
  await confirmSaveBtn.click()

  // Wait for server roadmap URL
  await ownerPage.waitForURL(/\/workspace\?roadmap=rm_/, { timeout: 15_000 })
  const url = new URL(ownerPage.url())
  const serverRoadmapId = url.searchParams.get('roadmap')!
  expect(serverRoadmapId).toMatch(/^rm_/)

  // Wait for owner to be live
  const ownerStatus = ownerPage.locator('.sync-status-indicator')
  await expect(ownerStatus).toHaveClass(/is-live/, { timeout: 10_000 })

  // Owner opens Share modal to get Editor invite link
  const shareBtn = ownerPage.locator('.header-end button', { hasText: 'Share' })
  await expect(shareBtn).toBeVisible()
  await shareBtn.click()

  const shareModal = ownerPage.getByRole('dialog', { name: /Share this roadmap/i })
  await expect(shareModal).toBeVisible()

  // Find editor invite section, rotate/generate to reveal active URL, and copy invite code
  const editorSection = shareModal.locator('.share-role-section', { hasText: 'Private editor invite' })
  await expect(editorSection).toBeVisible()

  const rotateOrGenerateBtn = editorSection.getByRole('button', { name: /Rotate link|Generate invite/i })
  await expect(rotateOrGenerateBtn).toBeVisible()
  await rotateOrGenerateBtn.click()

  const inviteCodeEl = editorSection.locator('code')
  await expect(inviteCodeEl).toBeVisible({ timeout: 5000 })
  const inviteUrl = await inviteCodeEl.textContent()
  expect(inviteUrl).toBeTruthy()

  // Close share modal
  await shareModal.getByRole('button', { name: 'Done' }).click()
  await expect(shareModal).not.toBeVisible()

  // Editor joins via invite link in separate browser context
  const editorContext = await browser.newContext()
  const editorPage = await editorContext.newPage()

  await editorPage.goto(inviteUrl!)
  const joinInput = editorPage.getByRole('textbox')
  await expect(joinInput).toBeVisible()
  await joinInput.fill('Collaborator Two')
  const joinBtn = editorPage.getByRole('button', { name: /Open roadmap/i })
  await joinBtn.click()

  await editorPage.waitForURL(/\/workspace\?roadmap=/, { timeout: 15_000 })
  const editorStatus = editorPage.locator('.sync-status-indicator')
  await expect(editorStatus).toHaveClass(/is-live/, { timeout: 10_000 })

  return {
    ownerContext,
    ownerPage,
    editorContext,
    editorPage,
    serverRoadmapId,
    inviteUrl: inviteUrl!,
  }
}

test.describe('Real Multi-Client Browser Collaboration', () => {
  test('Case E (1 & 3 & 9): one collaborator completes task while another edits unrelated task with focus retention and quiet UI', async ({ browser }) => {
    const { ownerContext, ownerPage, editorContext, editorPage } = await setupSharedRoadmap(browser)

    try {
      // Editor expands first phase and opens second task edit form
      const editorFirstPhase = editorPage.locator('.phase').first()
      const isExpanded = await editorFirstPhase.evaluate((el) => el.classList.contains('expanded'))
      if (!isExpanded) {
        await editorFirstPhase.getByRole('button', { name: /Expand phase/i }).click()
      }

      const editorTasks = editorFirstPhase.locator('.task')
      const targetTask = editorTasks.nth(1)
      const targetTaskId = await targetTask.evaluate((el) => el.id.replace('task-', ''))

      // Expand task if needed
      const expandBtn = targetTask.getByRole('button', { name: /Expand task/i })
      if (await expandBtn.isVisible()) {
        await expandBtn.click()
      }

      // Open Edit details
      await targetTask.getByRole('button', { name: /Edit details/i }).click()
      const descInput = editorPage.locator(`#edit-desc-${targetTaskId}`)
      await expect(descInput).toBeVisible()
      await descInput.focus()
      await descInput.fill('Active unsaved collaborator notes with keyboard focus')
      await expect(descInput).toBeFocused()

      // Owner marks the third task complete (starts incomplete in starter template)
      const ownerFirstPhase = ownerPage.locator('.phase').first()
      const ownerThirdTask = ownerFirstPhase.locator('.task').nth(2)
      const ownerThirdTaskCheck = ownerThirdTask.locator('[role="checkbox"]')
      await expect(ownerThirdTask).not.toHaveClass(/done/)
      await ownerThirdTaskCheck.click()
      await expect(ownerThirdTask).toHaveClass(/done/, { timeout: 5000 })

      // Realtime update propagates to Editor: third task becomes done
      const editorThirdTask = editorFirstPhase.locator('.task').nth(2)
      await expect(editorThirdTask).toHaveClass(/done/, { timeout: 10_000 })

      // Verify Editor safety: active editor form remains open, draft text is retained, and input is still focused
      await expect(descInput).toBeVisible()
      await expect(descInput).toHaveValue('Active unsaved collaborator notes with keyboard focus')
      await expect(descInput).toBeFocused()

      // Verify Visual Stability (AGY02 quiet collaboration): no error or warning toasts displayed for routine sync
      const errorToasts = editorPage.locator('.toast.is-error')
      await expect(errorToasts).toHaveCount(0)

      await editorPage.screenshot({
        path: `${screenshotDir}/multi-client-unrelated-edit.png`,
        fullPage: false,
      })
    } finally {
      await ownerContext.close()
      await editorContext.close()
    }
  })

  test('2: same-field concurrent edit detects conflict, preserves both versions, and resolves explicitly', async ({ browser }) => {
    const { ownerContext, ownerPage, editorContext, editorPage } = await setupSharedRoadmap(browser)


    try {
      // Ensure Phase 1 is expanded on both owner and editor
      for (const page of [ownerPage, editorPage]) {
        const firstPhase = page.locator('.phase').first()
        const isExp = await firstPhase.evaluate((el) => el.classList.contains('expanded'))
        if (!isExp) {
          await firstPhase.getByRole('button', { name: /Expand phase/i }).click()
        }
      }

      // Both open Phase 1 Task 1
      const ownerTask = ownerPage.locator('.phase').first().locator('.task').first()
      const ownerTaskId = await ownerTask.evaluate((el) => el.id.replace('task-', ''))

      const expandBtnOwner = ownerTask.getByRole('button', { name: /Expand task/i })
      if (await expandBtnOwner.isVisible()) await expandBtnOwner.click()

      const editorTask = editorPage.locator('.phase').first().locator('.task').first()
      const expandBtnEditor = editorTask.getByRole('button', { name: /Expand task/i })
      if (await expandBtnEditor.isVisible()) await expandBtnEditor.click()

      await ownerTask.getByRole('button', { name: /Edit details/i }).click()
      await editorTask.getByRole('button', { name: /Edit details/i }).click()

      // Owner modifies description
      const ownerDesc = ownerPage.locator(`#edit-desc-${ownerTaskId}`)
      await ownerDesc.fill('Owner authoritative description update')

      // Editor simultaneously modifies description before owner commits
      const editorDesc = editorTask.locator('textarea[id^="edit-desc-"]')
      await editorDesc.fill('Editor draft conflicting notes')

      // Owner saves to server
      const ownerSaveBtn = ownerTask.locator('.edit-actions button.primary')
      await ownerSaveBtn.click()
      await expect(ownerTask.locator('.edit-form')).toHaveCount(0, { timeout: 5000 })

      // Realtime event arrives on Editor: field-level conflict detected!
      const conflictAlert = editorTask.locator('.task-field-conflict')
      await expect(conflictAlert).toBeVisible({ timeout: 10_000 })

      // Both versions must be preserved and visible to Editor
      await expect(conflictAlert).toContainText('Server conflict:')
      await expect(conflictAlert).toContainText('Owner authoritative description update')
      await expect(editorDesc).toHaveValue('Editor draft conflicting notes')

      // Save button disabled until conflict resolved
      const editorSaveBtn = editorTask.locator('.edit-actions button.primary')
      await expect(editorSaveBtn).toBeDisabled()

      // Editor chooses "Keep my draft"
      const keepDraftBtn = conflictAlert.getByRole('button', { name: 'Keep my draft' })
      await keepDraftBtn.click()

      await expect(conflictAlert).not.toBeVisible()

      // Editor clicks Resume editing if lock banner is displayed now that owner has released it
      const resumeBtn = editorTask.locator('.task-row-lock-resume')
      if (await resumeBtn.isVisible()) {
        await resumeBtn.click()
      }

      await expect(editorSaveBtn).toBeEnabled({ timeout: 5000 })
      await expect(editorDesc).toHaveValue('Editor draft conflicting notes')

      await editorPage.screenshot({
        path: `${screenshotDir}/multi-client-same-field-conflict.png`,
        fullPage: false,
      })
    } finally {
      await ownerContext.close()
      await editorContext.close()
    }
  })

  test('4 & 8: phase creation POST succeeds, SSE propagates to second client, survives reload, create/delete/reorder all work', async ({ browser }) => {
    const { ownerContext, ownerPage, editorContext, editorPage } = await setupSharedRoadmap(browser)

    try {
      // --- Baseline: both clients see 3 phases from the template ---
      await expect(ownerPage.locator('.phase')).toHaveCount(3, { timeout: 5_000 })
      await expect(editorPage.locator('.phase')).toHaveCount(3, { timeout: 5_000 })

      // --- Step 1: Editor creates a new phase via the actual UI button ---
      // The real button carries the class .add-phase-after-list. We assert
      // visibility before clicking so a selector mismatch fails the test
      // rather than silently skipping the action.
      const addPhaseBtn = editorPage.locator('.add-phase-after-list')
      await expect(addPhaseBtn).toBeVisible({ timeout: 5_000 })
      await addPhaseBtn.click()

      // Editor optimistically shows 4 phases immediately
      await expect(editorPage.locator('.phase')).toHaveCount(4, { timeout: 5_000 })

      // No error toast must appear - the POST must succeed (HTTP 201)
      const editorErrorToasts = editorPage.locator('.toast.is-error')
      await expect(editorErrorToasts).toHaveCount(0, { timeout: 5_000 })

      // The sync indicator must remain live (not downgraded to error/offline)
      const editorStatus = editorPage.locator('.sync-status-indicator')
      await expect(editorStatus).toHaveClass(/is-live/, { timeout: 5_000 })

      // --- Step 2: Owner receives the new phase through real SSE transport ---
      // This assertion proves the POST reached the backend (HTTP 201) and
      // the server broadcast a phase.created SSE event.
      await expect(ownerPage.locator('.phase')).toHaveCount(4, { timeout: 15_000 })

      // Owner's sync indicator must remain live after the SSE event
      const ownerStatus = ownerPage.locator('.sync-status-indicator')
      await expect(ownerStatus).toHaveClass(/is-live/, { timeout: 5_000 })

      // --- Step 3: The new phase survives an editor browser reload ---
      // A phase that only exists optimistically (failed POST) would disappear
      // on reload. Persistence here confirms the database record was written.
      await editorPage.reload()
      await editorPage.waitForURL(/\/workspace\?roadmap=/, { timeout: 15_000 })
      await expect(editorPage.locator('.sync-status-indicator')).toHaveClass(/is-live/, { timeout: 10_000 })
      await expect(editorPage.locator('.phase')).toHaveCount(4, { timeout: 10_000 })

      // --- Step 4: Delete the created phase and verify propagation ---
      // Owner deletes the 4th (newly created) phase
      const targetPhase = ownerPage.locator('.phase').nth(3)
      const settingsBtn = targetPhase.locator('button[title*="Phase settings"]')
      await expect(settingsBtn).toBeVisible({ timeout: 5_000 })
      await settingsBtn.click()

      const deleteBtn = ownerPage.getByRole('menuitem', { name: /Delete phase/i })
      await expect(deleteBtn).toBeVisible({ timeout: 3_000 })
      await deleteBtn.click()

      const confirmDialog = ownerPage.getByRole('alertdialog', { name: /Delete phase/i })
      await expect(confirmDialog).toBeVisible({ timeout: 3_000 })
      await confirmDialog.getByRole('button', { name: 'Delete phase' }).click()

      // Owner immediately shows 3 phases (optimistic delete)
      await expect(ownerPage.locator('.phase')).toHaveCount(3, { timeout: 5_000 })
      // No error toast on owner after delete
      await expect(ownerPage.locator('.toast.is-error')).toHaveCount(0, { timeout: 5_000 })

      // Editor receives delete via SSE and drops to 3 phases
      await expect(editorPage.locator('.phase')).toHaveCount(3, { timeout: 15_000 })

      // --- Step 5: Reorder phases on the owner and verify SSE propagation ---
      // Collapse all phases first (required invariant from test 8: owner
      // deliberately collapsed phases must stay collapsed after remote update)
      const toggleAllBtn = ownerPage.locator('.toolbar-collapse-action')
      if (await toggleAllBtn.textContent().then((t) => t?.includes('Expand all'))) {
        await toggleAllBtn.click()
      }
      await expect(toggleAllBtn).toHaveText(/Collapse all/i)
      await toggleAllBtn.click()
      await expect(ownerPage.locator('.phase.expanded')).toHaveCount(0, { timeout: 3_000 })

      // Editor creates another phase (step 5 reorder test)
      await expect(addPhaseBtn).toBeVisible({ timeout: 5_000 })
      await addPhaseBtn.click()
      await expect(editorPage.locator('.phase')).toHaveCount(4, { timeout: 5_000 })
      await expect(editorPage.locator('.toast.is-error')).toHaveCount(0, { timeout: 5_000 })

      // Owner receives via SSE - collapsed phases must REMAIN collapsed
      await expect(ownerPage.locator('.phase')).toHaveCount(4, { timeout: 15_000 })
      await expect(ownerPage.locator('.phase.expanded')).toHaveCount(0, { timeout: 3_000 })

      await ownerPage.screenshot({
        path: `${screenshotDir}/multi-client-collapsed-phases.png`,
        fullPage: false,
      })
    } finally {
      await ownerContext.close()
      await editorContext.close()
    }
  })


  test('10: session revocation terminates realtime stream cleanly while preserving local draft', async ({ browser }) => {
    const { ownerContext, ownerPage, editorContext, editorPage } = await setupSharedRoadmap(browser)

    try {
      // Editor opens a task and types an uncommitted draft
      const editorFirstPhase = editorPage.locator('.phase').first()
      if (!await editorFirstPhase.evaluate((el) => el.classList.contains('expanded'))) {
        await editorFirstPhase.getByRole('button', { name: /Expand phase/i }).click()
      }
      const editorTask = editorFirstPhase.locator('.task').first()
      const expandBtn = editorTask.getByRole('button', { name: /Expand task/i })
      if (await expandBtn.isVisible()) await expandBtn.click()
      await editorTask.getByRole('button', { name: /Edit details/i }).click()

      const titleInput = editorTask.locator('input[id^="edit-title-"]')
      await titleInput.fill('Important unsaved work before revocation')

      // Owner opens Team panel and revokes Collaborator Two
      const teamTab = ownerPage.getByRole('tab', { name: /Team/i })
      await teamTab.click()

      const participantRow = ownerPage.locator('.team-group', { hasText: 'Collaborator Two' })
      await expect(participantRow).toBeVisible({ timeout: 10_000 })
      const revokeBtn = participantRow.getByRole('button', { name: /Revoke user/i })
      await revokeBtn.click()

      const confirmDialog = ownerPage.getByRole('alertdialog', { name: /Revoke participant/i })
      await expect(confirmDialog).toBeVisible()
      await confirmDialog.getByRole('button', { name: 'Revoke participant' }).click()

      // Editor receives participant revocation: notification displayed
      const toast = editorPage.locator('.toast.is-error, .toast', { hasText: /revoked/i })
      await expect(toast).toBeVisible({ timeout: 10_000 })

      // Editor draft must remain preserved in DOM
      await expect(titleInput).toHaveValue('Important unsaved work before revocation')

      await editorPage.screenshot({
        path: `${screenshotDir}/multi-client-session-revoked.png`,
        fullPage: false,
      })
    } finally {
      await ownerContext.close()
      await editorContext.close()
    }
  })

  test('Case A: unrelated simultaneous edits persist and converge with zero conflict UI', async ({ browser }) => {
    const { ownerContext, ownerPage, editorContext, editorPage } = await setupSharedRoadmap(browser)
    const puts: string[] = []
    trackAggregatePuts(ownerPage, puts)
    trackAggregatePuts(editorPage, puts)

    try {
      const ownerPhase = await ensurePhaseExpanded(ownerPage, 0)
      const editorPhase = await ensurePhaseExpanded(editorPage, 0)

      // Owner edits Task 1
      const ownerTask = ownerPhase.locator('.task').first()
      const expandOwner = ownerTask.getByRole('button', { name: /Expand task/i })
      if (await expandOwner.isVisible()) await expandOwner.click()
      await ownerTask.getByRole('button', { name: /Edit details/i }).click()
      const ownerTitleInput = ownerTask.locator('input[id^="edit-title-"]')
      await ownerTitleInput.fill('Task 1 - Owner Edit')

      // Editor edits Task 2
      const editorTask = editorPhase.locator('.task').nth(1)
      const expandEditor = editorTask.getByRole('button', { name: /Expand task/i })
      if (await expandEditor.isVisible()) await expandEditor.click()
      await editorTask.getByRole('button', { name: /Edit details/i }).click()
      const editorTitleInput = editorTask.locator('input[id^="edit-title-"]')
      await editorTitleInput.fill('Task 2 - Editor Edit')

      // Both save simultaneously
      const ownerSaveBtn = ownerTask.locator('.edit-actions button.primary')
      const editorSaveBtn = editorTask.locator('.edit-actions button.primary')
      await Promise.all([
        ownerSaveBtn.click(),
        editorSaveBtn.click(),
      ])

      // Wait for edit forms to close
      await expect(ownerTask.locator('.edit-form')).toHaveCount(0, { timeout: 5000 })
      await expect(editorTask.locator('.edit-form')).toHaveCount(0, { timeout: 5000 })

      // Verify convergence on both clients via realtime
      await expect(ownerPhase.locator('.task').nth(1)).toContainText('Task 2 - Editor Edit', { timeout: 10_000 })
      await expect(editorPhase.locator('.task').first()).toContainText('Task 1 - Owner Edit', { timeout: 10_000 })

      // Zero conflict modal or banner
      await expect(ownerPage.locator('.sync-conflict-review')).toHaveCount(0)
      await expect(editorPage.locator('.sync-conflict-review')).toHaveCount(0)
      await expect(ownerPage.locator('.conflict-banner')).toHaveCount(0)
      await expect(editorPage.locator('.conflict-banner')).toHaveCount(0)

      // Zero error / warning toasts
      await expect(ownerPage.locator('.toast.is-error, .toast.is-warning')).toHaveCount(0)
      await expect(editorPage.locator('.toast.is-error, .toast.is-warning')).toHaveCount(0)

      // Zero aggregate whole-roadmap PUTs
      expect(puts).toHaveLength(0)
    } finally {
      await ownerContext.close()
      await editorContext.close()
    }
  })

  test('Case B: different mutation types (phase rename + task complete) converge quietly', async ({ browser }) => {
    const { ownerContext, ownerPage, editorContext, editorPage } = await setupSharedRoadmap(browser)
    const puts: string[] = []
    trackAggregatePuts(ownerPage, puts)
    trackAggregatePuts(editorPage, puts)

    try {
      const ownerPhase = await ensurePhaseExpanded(ownerPage, 0)
      const editorPhase = await ensurePhaseExpanded(editorPage, 0)

      // Owner renames Phase 1 via settings menu
      const settingsBtn = ownerPhase.locator('button[title*="Phase settings"]')
      await expect(settingsBtn).toBeVisible()
      await settingsBtn.click()
      const renameMenuItem = ownerPage.getByRole('menuitem', { name: /^Rename$/i })
      await expect(renameMenuItem).toBeVisible()
      await renameMenuItem.click()

      const phaseNameInput = ownerPhase.locator('.phase-name-input')
      await expect(phaseNameInput).toBeVisible()
      await phaseNameInput.fill('Phase 1 Renamed by Owner')
      await phaseNameInput.press('Enter')

      // Editor completes Task 3 (which starts incomplete)
      const editorTask3 = editorPhase.locator('.task').nth(2)
      const checkbox = editorTask3.locator('[role="checkbox"]')
      await expect(editorTask3).not.toHaveClass(/done/)
      await checkbox.click()
      await expect(editorTask3).toHaveClass(/done/, { timeout: 5000 })

      // Verify propagation:
      // Editor receives phase rename
      await expect(editorPhase.locator('.phase-head .name').first()).toHaveText('Phase 1 Renamed by Owner', { timeout: 10_000 })
      // Owner receives task 3 done
      await expect(ownerPhase.locator('.task').nth(2)).toHaveClass(/done/, { timeout: 10_000 })

      // No conflict UI or toasts
      await expect(ownerPage.locator('.sync-conflict-review')).toHaveCount(0)
      await expect(editorPage.locator('.sync-conflict-review')).toHaveCount(0)
      await expect(ownerPage.locator('.toast.is-error, .toast.is-warning')).toHaveCount(0)
      await expect(editorPage.locator('.toast.is-error, .toast.is-warning')).toHaveCount(0)

      expect(puts).toHaveLength(0)
    } finally {
      await ownerContext.close()
      await editorContext.close()
    }
  })

  test('Case C: rapid alternating edits converge authoritatively with zero aggregate PUTs', async ({ browser }) => {
    const { ownerContext, ownerPage, editorContext, editorPage } = await setupSharedRoadmap(browser)
    const puts: string[] = []
    trackAggregatePuts(ownerPage, puts)
    trackAggregatePuts(editorPage, puts)

    try {
      const ownerPhase = await ensurePhaseExpanded(ownerPage, 0)
      const editorPhase = await ensurePhaseExpanded(editorPage, 0)

      // Rapid edit 1: Owner completes Task 2
      const ownerTask2 = ownerPhase.locator('.task').nth(1)
      await ownerTask2.locator('[role="checkbox"]').click()

      // Rapid edit 2: Editor completes Task 3
      const editorTask3 = editorPhase.locator('.task').nth(2)
      await editorTask3.locator('[role="checkbox"]').click()

      // Rapid edit 3: Owner creates a new phase
      const addPhaseBtn = ownerPage.locator('.add-phase-after-list')
      await addPhaseBtn.click()

      // Rapid edit 4: Editor re-opens Task 2 (unchecks)
      await editorPhase.locator('.task').nth(1).locator('[role="checkbox"]').click()

      // Wait for both to be live and converge
      await expect(ownerPage.locator('.phase')).toHaveCount(4, { timeout: 15_000 })
      await expect(editorPage.locator('.phase')).toHaveCount(4, { timeout: 15_000 })

      // Task 2 should be incomplete (last write from Editor)
      await expect(ownerPhase.locator('.task').nth(1)).not.toHaveClass(/done/, { timeout: 10_000 })
      await expect(editorPhase.locator('.task').nth(1)).not.toHaveClass(/done/, { timeout: 10_000 })

      // Task 3 should be complete
      await expect(ownerPhase.locator('.task').nth(2)).toHaveClass(/done/, { timeout: 10_000 })
      await expect(editorPhase.locator('.task').nth(2)).toHaveClass(/done/, { timeout: 10_000 })

      // Zero aggregate PUTs throughout all rapid edits!
      expect(puts).toHaveLength(0)

      // Zero conflict modals or warning toasts
      await expect(ownerPage.locator('.sync-conflict-review')).toHaveCount(0)
      await expect(editorPage.locator('.sync-conflict-review')).toHaveCount(0)
      await expect(ownerPage.locator('.toast.is-error')).toHaveCount(0)
      await expect(editorPage.locator('.toast.is-error')).toHaveCount(0)
    } finally {
      await ownerContext.close()
      await editorContext.close()
    }
  })

  test('Case D: same field write serializes with later accepted write winning and zero conflict chooser modal', async ({ browser }) => {
    const { ownerContext, ownerPage, editorContext, editorPage } = await setupSharedRoadmap(browser)
    const puts: string[] = []
    trackAggregatePuts(ownerPage, puts)
    trackAggregatePuts(editorPage, puts)

    try {
      const ownerPhase = await ensurePhaseExpanded(ownerPage, 0)
      const editorPhase = await ensurePhaseExpanded(editorPage, 0)

      // Owner renames Phase 1 to "Phase One by Owner"
      const ownerSettingsBtn = ownerPhase.locator('button[title*="Phase settings"]')
      await expect(ownerSettingsBtn).toBeVisible()
      await ownerSettingsBtn.click()
      const ownerRenameMenuItem = ownerPage.getByRole('menuitem', { name: /^Rename$/i })
      await expect(ownerRenameMenuItem).toBeVisible()
      await ownerRenameMenuItem.click()
      const ownerInput = ownerPhase.locator('.phase-name-input')
      await expect(ownerInput).toBeVisible()
      await ownerInput.fill('Phase One by Owner')
      await ownerInput.press('Enter')
      await expect(ownerPhase.locator('.phase-head .name').first()).toHaveText('Phase One by Owner', { timeout: 5000 })

      // Editor immediately renames the exact same Phase 1 to "Phase One by Editor"
      const editorSettingsBtn = editorPhase.locator('button[title*="Phase settings"]')
      await expect(editorSettingsBtn).toBeVisible({ timeout: 5000 })
      await editorSettingsBtn.click()
      const editorRenameMenuItem = editorPage.getByRole('menuitem', { name: /^Rename$/i })
      await expect(editorRenameMenuItem).toBeVisible()
      await editorRenameMenuItem.click()
      const editorInput = editorPhase.locator('.phase-name-input')
      await expect(editorInput).toBeVisible()
      await editorInput.fill('Phase One by Editor')
      await editorInput.press('Enter')

      // Later accepted write (Editor: "Phase One by Editor") wins and converges on both clients
      await expect(ownerPhase.locator('.phase-head .name').first()).toHaveText('Phase One by Editor', { timeout: 10_000 })
      await expect(editorPhase.locator('.phase-head .name').first()).toHaveText('Phase One by Editor', { timeout: 10_000 })

      // Zero conflict chooser modal (SyncConflictReviewPanel)
      await expect(ownerPage.locator('.sync-conflict-review')).toHaveCount(0)
      await expect(editorPage.locator('.sync-conflict-review')).toHaveCount(0)
      await expect(ownerPage.locator('[role="dialog"][name*="conflict" i]')).toHaveCount(0)
      await expect(editorPage.locator('[role="dialog"][name*="conflict" i]')).toHaveCount(0)

      expect(puts).toHaveLength(0)
    } finally {
      await ownerContext.close()
      await editorContext.close()
    }
  })

  test('Case F: own event echo does not trigger secondary write or full refresh', async ({ browser }) => {
    const { ownerContext, ownerPage, editorContext } = await setupSharedRoadmap(browser)

    try {
      const ownerPhase = await ensurePhaseExpanded(ownerPage, 0)
      const ownerTask = ownerPhase.locator('.task').first()
      const expandOwner = ownerTask.getByRole('button', { name: /Expand task/i })
      if (await expandOwner.isVisible()) await expandOwner.click()
      await ownerTask.getByRole('button', { name: /Edit details/i }).click()

      const titleInput = ownerTask.locator('input[id^="edit-title-"]')
      await titleInput.fill('Echo Monitored Title')

      // Track network requests after clicking save
      const secondaryRequests: string[] = []
      ownerPage.on('request', (req) => {
        const url = req.url()
        if (req.method() === 'PUT' || req.method() === 'POST' || (req.method() === 'GET' && url.includes('/api/roadmaps/rm_'))) {
          secondaryRequests.push(`${req.method()} ${url}`)
        }
      })

      const saveBtn = ownerTask.locator('.edit-actions button.primary')
      await saveBtn.click()
      await expect(ownerTask.locator('.edit-form')).toHaveCount(0, { timeout: 5000 })

      // Wait for SSE echo to arrive and settle (sync status indicator remains live)
      await ownerPage.waitForTimeout(2000)
      await expect(ownerPage.locator('.sync-status-indicator')).toHaveClass(/is-live/)

      // Ensure no secondary writes (PUT or POST) were triggered by the echo
      const secondaryWrites = secondaryRequests.filter((r) => r.startsWith('PUT') || r.startsWith('POST'))
      expect(secondaryWrites).toHaveLength(0)

      // Ensure no full roadmap GET refetch occurred (the focused mutation response was authoritative)
      const fullGetRequests = secondaryRequests.filter((r) => r.startsWith('GET') && !r.includes('/activity') && !r.includes('/export'))
      expect(fullGetRequests).toHaveLength(0)
    } finally {
      await ownerContext.close()
      await editorContext.close()
    }
  })

  test('Case G: reconnect performs authoritative resync and automatic convergence without manual conflict resolution', async ({ browser }) => {
    const { ownerContext, ownerPage, editorContext, editorPage } = await setupSharedRoadmap(browser)

    try {
      const ownerPhase = await ensurePhaseExpanded(ownerPage, 0)
      const editorPhase = await ensurePhaseExpanded(editorPage, 0)

      // Simulate Editor disconnecting (set offline)
      await editorContext.setOffline(true)

      // While Editor is offline, Owner marks Task 3 complete
      const ownerTask3 = ownerPhase.locator('.task').nth(2)
      const checkbox = ownerTask3.locator('[role="checkbox"]')
      await expect(ownerTask3).not.toHaveClass(/done/)
      await checkbox.click()
      await expect(ownerTask3).toHaveClass(/done/, { timeout: 5000 })

      // Restore Editor connection
      await editorContext.setOffline(false)

      // Editor reconnects and converges automatically: Task 3 becomes done
      await expect(editorPage.locator('.sync-status-indicator')).toHaveClass(/is-live/, { timeout: 15_000 })
      await expect(editorPhase.locator('.task').nth(2)).toHaveClass(/done/, { timeout: 15_000 })

      // Zero manual conflict resolution dialog
      await expect(editorPage.locator('.sync-conflict-review')).toHaveCount(0)
      await expect(editorPage.locator('[role="dialog"][name*="conflict" i]')).toHaveCount(0)
    } finally {
      await ownerContext.close()
      await editorContext.close()
    }
  })

  test('Password management: owner sets, changes, and removes password; join validation enforces password; editor excluded', async ({ browser }) => {
    const { ownerContext, ownerPage, editorContext, editorPage, inviteUrl } = await setupSharedRoadmap(browser)

    try {
      // 1. Editor has no Share button in the header (owner only)
      const editorShareBtn = editorPage.locator('.header-end button', { hasText: 'Share' })
      await expect(editorShareBtn).toHaveCount(0)

      // 2. Owner opens Share modal: sees Roadmap password section
      const ownerShareBtn = ownerPage.locator('.header-end button', { hasText: 'Share' })
      await ownerShareBtn.click()
      const ownerShareModal = ownerPage.getByRole('dialog', { name: /Share this roadmap/i })
      await expect(ownerShareModal).toBeVisible()

      const passwordSection = ownerShareModal.locator('.roadmap-password-section')
      await expect(passwordSection).toBeVisible()
      await expect(passwordSection).toContainText('Require a password in addition to invite links')

      // Owner sets password
      const setPwBtn = passwordSection.getByRole('button', { name: 'Set password' })
      await setPwBtn.click()

      const pwInput = passwordSection.locator('.roadmap-password-input')
      await expect(pwInput).toBeVisible()
      await pwInput.fill('secret-pass-123')
      await passwordSection.getByRole('button', { name: 'Save' }).click()

      // Verifies password is active
      await expect(passwordSection).toContainText('Collaborators must provide this password', { timeout: 5000 })
      await expect(passwordSection.getByRole('button', { name: 'Change password' })).toBeVisible()
      await expect(passwordSection.getByRole('button', { name: 'Remove password' })).toBeVisible()
      await ownerShareModal.getByRole('button', { name: 'Done' }).click()

      // 3. New guest context visits invite link
      const guestContext = await browser.newContext()
      const guestPage = await guestContext.newPage()
      await guestPage.goto(inviteUrl)

      await guestPage.locator('#jn').fill('Guest Collaborator')
      const joinBtn = guestPage.getByRole('button', { name: /Open roadmap/i })

      // Click join without password
      await joinBtn.click()

      // Password input appears with prompt
      const guestPwInput = guestPage.locator('#jpw')
      await expect(guestPwInput).toBeVisible({ timeout: 5000 })
      await expect(guestPage.locator('.note-line[role="alert"]')).toContainText('This roadmap requires a password')

      // Enter wrong password
      await guestPwInput.fill('wrongpassword')
      await joinBtn.click()
      await expect(guestPage.locator('.note-line[role="alert"]')).toContainText('This roadmap requires a password')

      // Enter correct password
      await guestPwInput.fill('secret-pass-123')
      await joinBtn.click()

      // Successfully joined and workspace loads
      await guestPage.waitForURL(/\/workspace\?roadmap=/, { timeout: 15_000 })
      await expect(guestPage.locator('.sync-status-indicator')).toHaveClass(/is-live/, { timeout: 10_000 })

      // 4. Owner changes password
      await ownerShareBtn.click()
      await expect(ownerShareModal).toBeVisible()
      await passwordSection.getByRole('button', { name: 'Change password' }).click()
      await pwInput.fill('new-pass-456')
      await passwordSection.getByRole('button', { name: 'Save' }).click()
      await expect(passwordSection).toContainText('Collaborators must provide this password', { timeout: 5000 })
      await ownerShareModal.getByRole('button', { name: 'Done' }).click()

      // Existing guest is STILL connected and valid
      await expect(guestPage.locator('.sync-status-indicator')).toHaveClass(/is-live/)

      // 5. Owner removes password
      await ownerShareBtn.click()
      await expect(ownerShareModal).toBeVisible()
      await passwordSection.getByRole('button', { name: 'Remove password' }).click()
      await expect(passwordSection).toContainText('Require a password in addition to invite links', { timeout: 5000 })
      await ownerShareModal.getByRole('button', { name: 'Done' }).click()

      // 6. Another guest joins with no password required
      const guest2Context = await browser.newContext()
      const guest2Page = await guest2Context.newPage()
      await guest2Page.goto(inviteUrl)
      await guest2Page.locator('#jn').fill('Guest Two')
      await guest2Page.getByRole('button', { name: /Open roadmap/i }).click()
      await guest2Page.waitForURL(/\/workspace\?roadmap=/, { timeout: 15_000 })
      await expect(guest2Page.locator('.sync-status-indicator')).toHaveClass(/is-live/, { timeout: 10_000 })

      await guestContext.close()
      await guest2Context.close()
    } finally {
      await ownerContext.close()
      await editorContext.close()
    }
  })
})
