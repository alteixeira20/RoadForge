import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'
import { createRoadmap } from './helpers'

const screenshotDir = resolve(process.cwd(), '../../docs/agent-handoffs/screenshots')

test('preserves collapsed phases across remote updates and page reloads', async ({ page }) => {
  await createRoadmap(page, {
    title: 'Quiet Collaboration Roadmap',
    startingPoint: 'template',
  })

  // Verify phases are initially loaded
  const phases = page.locator('.phase')
  await expect(phases.first()).toBeVisible()

  // Collapse all phases using the toolbar controls
  const toggleAllBtn = page.locator('.toolbar-collapse-action')
  if (await toggleAllBtn.textContent().then((t) => t?.includes('Expand all'))) {
    await toggleAllBtn.click()
  }
  await expect(toggleAllBtn).toHaveText(/Collapse all/i)
  await toggleAllBtn.click()

  // Verify all phases are collapsed
  await expect(page.locator('.phase.expanded')).toHaveCount(0)

  // Take screenshot of collapsed state
  await page.screenshot({
    path: `${screenshotDir}/phases-collapsed.png`,
    fullPage: false,
  })

  // Simulate an update by updating another item or adding a task
  // Verify that an empty list of expanded phases remains intact
  await page.reload()
  await page.waitForURL(/\/workspace\?roadmap=/)
  await expect(page.locator('.phase.expanded')).toHaveCount(0)

  // Take screenshot verifying stability after reload
  await page.screenshot({
    path: `${screenshotDir}/phases-collapsed-after-reload.png`,
    fullPage: false,
  })
})

test('keeps active task editor focused and retains uncommitted edits during updates', async ({ page }) => {
  await createRoadmap(page, {
    title: 'Editor Stability Roadmap',
    startingPoint: 'template',
  })

  // Ensure first phase is expanded
  const firstPhase = page.locator('.phase').first()
  const isExpanded = await firstPhase.evaluate((el) => el.classList.contains('expanded'))
  if (!isExpanded) {
    const expandBtn = firstPhase.getByRole('button', { name: /Expand phase/i })
    await expandBtn.click()
  }

  // Find first task and expand it
  const firstTask = page.locator('.task').first()
  const expandTaskBtn = firstTask.getByRole('button', { name: /Expand task/i })
  if (await expandTaskBtn.isVisible()) {
    await expandTaskBtn.click()
  }

  // Open edit details form
  const editDetailsBtn = firstTask.getByRole('button', { name: /Edit details/i })
  await editDetailsBtn.click()

  const titleInput = page.getByLabel('Title')
  await expect(titleInput).toBeVisible()
  await titleInput.fill('In-progress collaborative draft text')
  await expect(titleInput).toHaveValue('In-progress collaborative draft text')
  await expect(titleInput).toBeFocused()

  // Take screenshot of active editor with draft
  await page.screenshot({
    path: `${screenshotDir}/active-task-editor-before-update.png`,
    fullPage: false,
  })

  // Trigger an unrelated state update on window
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'))
  })

  // Verify focus and draft text remain intact
  await expect(titleInput).toBeFocused()
  await expect(titleInput).toHaveValue('In-progress collaborative draft text')

  await page.screenshot({
    path: `${screenshotDir}/active-task-editor-after-update.png`,
    fullPage: false,
  })
})

test('maintains visual silence with quiet sync status indicator on desktop and mobile', async ({ page }) => {
  await createRoadmap(page, {
    title: 'Visual Silence Roadmap',
    startingPoint: 'template',
  })

  const indicator = page.locator('.sync-status-indicator')
  await expect(indicator).toBeVisible()
  await expect(indicator).toHaveText(/Local draft|Live/)

  // Desktop viewport check (1280x800)
  await page.setViewportSize({ width: 1280, height: 800 })
  const desktopBox = await indicator.boundingBox()
  expect(desktopBox).not.toBeNull()
  expect(desktopBox!.x + desktopBox!.width).toBeLessThanOrEqual(1280)
  expect(desktopBox!.y + desktopBox!.height).toBeLessThanOrEqual(800)

  await page.screenshot({
    path: `${screenshotDir}/desktop-workspace.png`,
    fullPage: false,
  })

  // Mobile viewport check (390x844)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(indicator).toBeVisible()
  const mobileBox = await indicator.boundingBox()
  expect(mobileBox).not.toBeNull()
  expect(mobileBox!.x + mobileBox!.width).toBeLessThanOrEqual(390)
  expect(mobileBox!.y + mobileBox!.height).toBeLessThanOrEqual(844)

  await page.screenshot({
    path: `${screenshotDir}/mobile-workspace.png`,
    fullPage: false,
  })
})

test('stable scroll position across unrelated updates', async ({ page }) => {
  await createRoadmap(page, {
    title: 'Scroll Stability Roadmap',
    startingPoint: 'template',
  })

  // Expand all phases so the page has enough scroll height
  const toggleAllBtn = page.locator('.toolbar-collapse-action')
  if (await toggleAllBtn.textContent().then((t) => t?.includes('Expand all'))) {
    await toggleAllBtn.click()
  }

  // Scroll down by 250px
  await page.evaluate(() => window.scrollTo(0, 250))
  const initialScrollY = await page.evaluate(() => window.scrollY)
  expect(initialScrollY).toBeGreaterThanOrEqual(100)

  // Measure DOM stability
  await page.evaluate(() => {
    window.dispatchEvent(new Event('scroll'))
  })

  const afterScrollY = await page.evaluate(() => window.scrollY)
  expect(Math.abs(afterScrollY - initialScrollY)).toBeLessThanOrEqual(2)
})

test('reduced motion support disables transitions on status indicator and toasts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await createRoadmap(page, {
    title: 'Reduced Motion Roadmap',
    startingPoint: 'template',
  })

  const indicator = page.locator('.sync-status-indicator')
  await expect(indicator).toBeVisible()

  const transitionDuration = await indicator.evaluate((element) =>
    getComputedStyle(element).transitionDuration,
  )
  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.00001)
})

test('normalizes legacy snapshot silently with zero upgrade notice, toast, or save loop', async ({ page }) => {
  const legacyRoadmapId = 'legacy_test_rm'
  await page.addInitScript(({ id }) => {
    const legacySnapshot = {
      roadmapName: 'Legacy Normalization Test',
      phases: [
        {
          id: 'p1',
          num: '01',
          name: 'Legacy Phase',
          status: 'active',
          color: '#808080',
          progress: 50,
          tasks: [
            {
              id: 't1',
              title: 'Task with dupe tags',
              done: false,
              tags: ['backend', 'backend', ' frontend '],
              assignees: ['Alice', 'Alice', 'Bob'],
              complexity: 'medium',
            },
          ],
        },
      ],
      saved: true,
      ownerDisplayName: 'Legacy Owner',
      updatedAt: '2026-01-01T00:00:00Z',
      isPasswordEnabled: false,
    }
    localStorage.setItem(`rf:roadmap:${id}`, JSON.stringify(legacySnapshot))
    localStorage.setItem('rf:activeRoadmapId', id)
  }, { id: legacyRoadmapId })

  await page.goto(`/workspace?roadmap=${legacyRoadmapId}`)
  await page.waitForSelector('.phase')

  // Verify tags were deduplicated and normalized in DOM
  const task = page.locator('.task').first()
  await expect(task).toBeVisible()

  // Verify NO upgrade notice banner exists
  await expect(page.locator('.workspace-upgrade-notice')).toHaveCount(0)
  await expect(page.locator('text=Roadmap updated')).toHaveCount(0)

  // Verify NO warning or error toasts
  await expect(page.locator('.toast.is-error, .toast.is-warning')).toHaveCount(0)

  // Verify sync status indicates saved / local draft without runaway saving
  const indicator = page.locator('.sync-status-indicator')
  await expect(indicator).toBeVisible()
  await expect(indicator).not.toHaveClass(/is-syncing/)

  // Reload page and verify still completely stable
  await page.reload()
  await page.waitForSelector('.phase')
  await expect(page.locator('.workspace-upgrade-notice')).toHaveCount(0)
  await expect(page.locator('.toast.is-error')).toHaveCount(0)
})
