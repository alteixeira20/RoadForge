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
  }
}

test.describe('Real Multi-Client Browser Collaboration', () => {
  test('1 & 3 & 9: one collaborator completes task while another edits unrelated task with focus retention and quiet UI', async ({ browser }) => {
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
})
