import { expect, test, type Page } from '@playwright/test'
import { createRoadmap } from './helpers'

const ISSUE_CHOOSER_URL = 'https://github.com/alteixeira20/RoadForge/issues/new/choose'

async function seedSyncedRoadmap(page: Page, role: 'owner' | 'editor' | 'viewer') {
  await page.addInitScript(({ seededRole }) => {
    const id = `browser-${seededRole}`
    const cache = {
      roadmapName: `${seededRole} browser roadmap`,
      phases: [{
        id: 'p-browser-1',
        num: '01',
        name: 'Planning',
        color: '#d97706',
        colorMode: 'auto',
        status: 'active',
        progress: 0,
        tasks: [],
      }],
      saved: true,
      ownerDisplayName: 'Browser Owner',
      updatedAt: '2026-07-25T18:00:00.000Z',
      isPasswordEnabled: false,
    }
    const auth = {
      serverRoadmapId: id,
      sessionToken: `session-${seededRole}`,
      participantId: `participant-${seededRole}`,
      role: seededRole,
    }
    localStorage.setItem('rf:displayName', 'Browser Tester')
    localStorage.setItem(`rf:roadmap:${id}`, JSON.stringify(cache))
    localStorage.setItem(`rf:auth:${id}`, JSON.stringify(auth))
    sessionStorage.setItem('rf:activeRoadmapId', id)
  }, { seededRole: role })
}

test('creates a blank roadmap, adds a task, and keeps it across reload', async ({ page }) => {
  await createRoadmap(page, { title: 'Blank browser roadmap', startingPoint: 'blank' })

  await page.getByRole('button', { name: /Add first task/ }).click()
  const titleInput = page.getByPlaceholder('New task title…')
  await titleInput.fill('Browser-persisted task')
  await titleInput.press('Enter')

  await page.reload()
  await expect(page.getByText('Browser-persisted task', { exact: true })).toBeVisible()
})

test('recovers after deleting the final phase and creates another phase', async ({ page }) => {
  await createRoadmap(page, { title: 'Recovery browser roadmap', startingPoint: 'blank' })

  await page.getByRole('button', { name: 'Phase settings for Planning' }).click()
  await page.getByRole('menuitem', { name: /Delete phase/ }).click()
  const confirmation = page.getByRole('alertdialog', { name: 'Delete phase?' })
  await expect(confirmation).toContainText('This is the final phase')
  await confirmation.getByRole('button', { name: 'Delete phase' }).click()

  await page.getByRole('button', { name: 'Create first phase' }).click()
  const phaseName = page.locator('.phase-name-input')
  await expect(phaseName).toBeFocused()
  await phaseName.fill('Recovered phase')
  await phaseName.press('Enter')

  await page.getByRole('button', { name: 'Add another phase', exact: true }).click()
  await expect(phaseName).toBeFocused()
  await phaseName.fill('Second phase')
  await phaseName.press('Enter')

  await page.reload()
  await expect(page.getByText('Recovered phase', { exact: true })).toBeVisible()
  await expect(page.getByText('Second phase', { exact: true })).toBeVisible()
})

test('creates a roadmap from the bundled template', async ({ page }) => {
  await createRoadmap(page, { title: 'Template browser roadmap', startingPoint: 'template' })

  await page.getByText('Delivered local-first foundation', { exact: true }).click()
  await expect(page.getByText('RF-001', { exact: true }).first()).toBeVisible()
})

test('announces invalid imports and exposes only the safe static report link', async ({ page }) => {
  await page.goto('/')
  const reportLink = page.getByRole('link', { name: /Report a problem with RoadForge/ }).first()
  await expect(reportLink).toHaveAttribute('href', ISSUE_CHOOSER_URL)
  await expect(reportLink).toHaveAttribute('target', '_blank')
  await expect(reportLink).toHaveAttribute('rel', /noopener/)
  await expect(reportLink).toHaveAttribute('aria-label', /Privacy warning/)

  await createRoadmap(page, { title: 'Import browser roadmap', startingPoint: 'blank' })
  await page.getByRole('button', { name: 'Import / Export' }).click()
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Choose JSON file/ }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles({
    name: 'invalid-roadmap.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"not":"a roadmap"}'),
  })
  await expect(page.getByText(/Import failed|roadmap file|phases/i).last()).toBeVisible()
})

for (const viewport of [
  { label: '200% reflow', width: 640, height: 720 },
  { label: 'mobile', width: 390, height: 844 },
]) {
  test(`keeps phase menus and color controls inside the ${viewport.label} viewport`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await createRoadmap(page, {
      title: `${viewport.label} overlay roadmap`,
      startingPoint: 'blank',
    })

    await page.getByRole('button', { name: 'Phase settings for Planning' }).click()
    await page.getByRole('menuitem', { name: 'Change color' }).click()
    const colorDialog = page.getByRole('dialog', { name: 'Color settings for Planning' })
    await expect(colorDialog).toBeVisible()
    const bounds = await colorDialog.boundingBox()
    const pageViewport = page.viewportSize()
    expect(bounds).not.toBeNull()
    expect(pageViewport).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(pageViewport!.width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

for (const role of ['owner', 'editor', 'viewer'] as const) {
  test(`${role} receives the essential synced workspace controls`, async ({ page }) => {
    await seedSyncedRoadmap(page, role)
    await page.route('**/api/**', (route) => route.abort('connectionrefused'))
    const id = `browser-${role}`
    await page.goto(`${role === 'viewer' ? '/shared' : '/workspace'}?roadmap=${id}`)
    await expect(page.getByRole('heading', { name: `${role} browser roadmap` })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Tags' })).toBeVisible()

    // Phase creation lives after the phase list, never in the top toolbar.
    await expect(page.getByRole('button', { name: 'Add phase', exact: true })).toHaveCount(0)
    const addPhase = page.getByRole('button', { name: 'Add another phase', exact: true })
    const share = page.getByRole('button', { name: 'Share' })
    if (role === 'owner') {
      await expect(addPhase.first()).toBeVisible()
      await expect(share).toBeVisible()
      await expect(page.getByRole('button', { name: 'Rename roadmap' })).toBeVisible()
    } else if (role === 'editor') {
      await expect(addPhase.first()).toBeVisible()
      await expect(share).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Rename roadmap' })).toBeVisible()
    } else {
      await expect(addPhase).toHaveCount(0)
      await expect(share).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Create your own', exact: true })).toBeVisible()
      await page.getByRole('tab', { name: 'Tags' }).click()
      await expect(page.getByText('Tag management is read-only in this view.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'New tag' })).toHaveCount(0)
    }
  })
}

const HEADER_VIEWPORTS = [
  { label: '1280px desktop', width: 1280, height: 800, expectsLabel: true },
  { label: '1024px laptop', width: 1024, height: 768, expectsLabel: false },
  { label: '900px narrow desktop', width: 900, height: 800, expectsLabel: false },
  { label: '768px tablet', width: 768, height: 1024, expectsLabel: false },
  { label: '600px small tablet', width: 600, height: 800, expectsLabel: false },
  { label: '390px mobile', width: 390, height: 844, expectsLabel: false },
] as const

for (const viewport of HEADER_VIEWPORTS) {
  test(`keeps header actions on one line at ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await createRoadmap(page, {
      title: 'A deliberately long roadmap title that should truncate politely',
      startingPoint: 'blank',
    })

    const report = page.getByRole('link', { name: /Report a problem with RoadForge/ })
    await expect(report).toBeVisible()
    await expect(report).toHaveAttribute('href', ISSUE_CHOOSER_URL)
    await expect(report).toHaveAttribute('aria-label', /Privacy warning/)
    await expect(report).toHaveAttribute('title', /Report a problem/)

    // The label collapses to the glyph below the wide breakpoint, but the
    // accessible name never changes.
    const labelVisible = await page
      .locator('.header-report-link .problem-report-link-label')
      .isVisible()
    expect(labelVisible).toBe(viewport.expectsLabel)
    if (!viewport.expectsLabel) {
      const glyph = await report.evaluate(
        (node) => getComputedStyle(node, '::after').display,
      )
      expect(glyph).not.toBe('none')
    }

    // Single line: the control is never taller than one row of buttons.
    const box = await report.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeLessThanOrEqual(40)
    expect(
      await report.evaluate((node) => getComputedStyle(node).whiteSpace),
    ).toBe('nowrap')

    // Actions stay inside the viewport and aligned with the header row.
    const header = page.locator('.app-header')
    const headerBox = await header.boundingBox()
    expect(headerBox!.height).toBeLessThanOrEqual(72)
    const end = await page.locator('.header-end').boundingBox()
    expect(end!.x).toBeGreaterThanOrEqual(0)
    expect(end!.x + end!.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  })
}

test('does not expose a Help action in the workspace header', async ({ page }) => {
  await createRoadmap(page, { title: 'Header help roadmap', startingPoint: 'blank' })

  await expect(page.locator('.app-header a[href="/help"]')).toHaveCount(0)

  // The route itself still works by direct URL.
  await page.goto('/help')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

const TOOLBAR_VIEWPORTS = [
  { label: 'desktop', width: 1280, height: 800 },
  { label: '1024px', width: 1024, height: 768 },
  { label: '900px', width: 900, height: 800 },
  { label: '768px', width: 768, height: 1024 },
  { label: '600px', width: 600, height: 800 },
  { label: '390px', width: 390, height: 844 },
] as const

for (const viewport of TOOLBAR_VIEWPORTS) {
  test(`keeps roadmap navigation and tools inside the ${viewport.label} viewport`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await createRoadmap(page, {
      title: 'Toolbar layout roadmap',
      startingPoint: 'blank',
    })

    // Exactly two rows: navigation, then exploration tools.
    await expect(page.locator('.workspace-nav-row')).toHaveCount(1)
    await expect(page.locator('.workspace-tools-row')).toHaveCount(1)

    for (const selector of ['.workspace-nav-row', '.workspace-tools-row']) {
      const box = await page.locator(selector).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
    }

    // Tools stay reachable and share one row baseline per line.
    const search = page.getByRole('textbox', { name: 'Search roadmap tasks' })
    await expect(search).toBeVisible()
    await expect(page.getByRole('button', { name: /Filters/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Tags', exact: true })).toBeVisible()
    await expect(
      page.locator('.workspace-tools-row').getByRole('button', { name: 'Tags', exact: true }),
    ).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Expand all|Collapse all/ })).toBeVisible()

    const roadmapTabBox = await page.getByRole('tab', { name: 'Roadmap' }).boundingBox()
    const activityBox = await page.getByRole('button', { name: 'Activity' }).boundingBox()
    const tagsTabBox = await page.getByRole('tab', { name: 'Tags' }).boundingBox()
    expect(roadmapTabBox).not.toBeNull()
    expect(activityBox).not.toBeNull()
    expect(tagsTabBox).not.toBeNull()
    expect(roadmapTabBox!.x).toBeLessThan(activityBox!.x)
    expect(activityBox!.x).toBeLessThan(tagsTabBox!.x)

    const searchBox = await search.boundingBox()
    expect(searchBox!.width).toBeGreaterThanOrEqual(120)

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)

    await page.getByRole('tab', { name: 'Tags' }).click()
    await expect(page.getByRole('textbox', { name: 'Search roadmap tasks' })).toHaveCount(0)
    await expect(page.locator('.workspace-tools-row')).toHaveCount(0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  })
}

test('creates, edits, recolors, reloads, and deletes an unused tag', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await createRoadmap(page, {
    title: 'Tag registry browser roadmap',
    startingPoint: 'blank',
  })

  await page.getByRole('tab', { name: 'Tags' }).click()
  await expect(page.getByText('No tags yet')).toBeVisible()
  await page.getByRole('button', { name: 'New tag' }).click()
  await page.getByRole('textbox', { name: 'New tag label' }).fill('Release risk')
  const newTagColorButton = page.getByRole('button', { name: 'New tag color' })
  await newTagColorButton.click()
  const newTagDialog = page.getByRole('dialog', { name: 'New tag color' })
  await expect(newTagDialog).toBeVisible()
  await newTagDialog.getByRole('button', { name: 'Cyan' }).click()
  // Selecting a preset applies it and closes the popover immediately, same
  // as phase color selection, and returns focus to the trigger.
  await expect(newTagDialog).toBeHidden()
  await expect(newTagColorButton).toBeFocused()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('.tag-chip', { hasText: 'Release risk' })).toBeVisible()
  await expect(page.getByText('Not used', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Edit tag Release risk' }).click()
  const nameField = page.getByRole('textbox', { name: 'Tag label for Release risk' })
  await nameField.fill('Launch risk')
  await nameField.focus()
  await expect(nameField).toBeFocused()
  // Exactly one visible boundary: no native outline, a single box-shadow ring.
  await expect(nameField).toHaveCSS('outline-style', 'none')
  const boxShadow = await nameField.evaluate((node) => getComputedStyle(node).boxShadow)
  expect(boxShadow).not.toBe('none')
  expect(boxShadow.match(/rgba?\(/g)?.length ?? 0).toBe(1)

  const editColorButton = page.getByRole('button', { name: 'Change color for Release risk' })
  await editColorButton.click()
  const editDialog = page.getByRole('dialog', { name: 'Change color for Release risk' })
  await expect(editDialog).toBeVisible()
  const customHex = editDialog.getByRole('textbox', { name: 'Custom tag hex color' })
  await customHex.fill('#9333ea')
  await editDialog.getByRole('button', { name: 'Apply' }).click()
  await expect(editDialog).toBeHidden()
  await expect(editColorButton).toBeFocused()

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const chip = page.locator('.tag-chip', { hasText: 'Launch risk' })
  await expect(chip).toBeVisible()
  await expect(chip).toHaveCSS('border-radius', '4px')

  await page.reload()
  await page.getByRole('tab', { name: 'Tags' }).click()
  await expect(page.locator('.tag-chip', { hasText: 'Launch risk' })).toBeVisible()

  // The phase color picker still works, unaffected by the tag refactor.
  await page.getByRole('tab', { name: 'Roadmap' }).click()
  await page.getByRole('button', { name: 'Phase settings for Planning' }).click()
  await page.getByRole('menuitem', { name: 'Change color' }).click()
  const phaseDialog = page.getByRole('dialog', { name: 'Color settings for Planning' })
  await phaseDialog.getByRole('button', { name: 'Manual' }).click()
  await expect(phaseDialog.getByRole('button', { name: 'Teal' })).toBeVisible()
  await phaseDialog.getByRole('button', { name: 'Teal' }).click()
  // Phase color selection has always applied and closed immediately; the
  // shared picker preserves that, same as the tag flow above.
  await expect(phaseDialog).toBeHidden()
  await page.getByRole('button', { name: 'Phase settings for Planning' }).click()
  await page.getByRole('menuitem', { name: 'Change color' }).click()
  await expect(phaseDialog.getByRole('button', { name: 'Teal' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: 'Tags' }).click()
  await page.getByRole('button', { name: 'Delete tag Launch risk' }).click()
  await page
    .getByRole('alertdialog', { name: 'Delete tag?' })
    .getByRole('button', { name: 'Delete tag' })
    .click()
  await expect(page.getByText('No tags yet')).toBeVisible()

  expect(consoleErrors).toEqual([])
})

test('keeps the tag color picker inside narrow and 200%-reflow viewports', async ({ page }) => {
  for (const viewport of [
    { label: '200% reflow', width: 640, height: 720 },
    { label: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await createRoadmap(page, {
      title: `Tag color viewport roadmap ${viewport.label}`,
      startingPoint: 'blank',
    })

    await page.getByRole('tab', { name: 'Tags' }).click()
    await page.getByRole('button', { name: 'New tag' }).click()
    await page.getByRole('textbox', { name: 'New tag label' }).fill('Edge case')
    await page.getByRole('button', { name: 'New tag color' }).click()
    const dialog = page.getByRole('dialog', { name: 'New tag color' })
    await expect(dialog).toBeVisible()
    const bounds = await dialog.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

test('uses the same canonical tag chip in task rows and the Tags panel', async ({ page }) => {
  await createRoadmap(page, {
    title: 'Canonical tag chip roadmap',
    startingPoint: 'template',
  })

  await page.getByRole('tab', { name: 'Tags' }).click()
  const panelChip = page.locator('.tags-view .tag-chip', {
    hasText: 'Core workflow',
  }).first()
  await expect(panelChip).toBeVisible()
  const panelStyle = await panelChip.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      color: style.color,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      maxWidth: style.maxWidth,
      overflow: style.overflow,
      padding: style.padding,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
    }
  })

  await page.getByRole('tab', { name: 'Roadmap' }).click()
  const expand = page.getByRole('button', {
    name: 'Expand phase Delivered local-first foundation',
  })
  if (await expand.isVisible()) await expand.click()
  const taskChip = page.locator('.task-row .tag-chip', {
    hasText: 'Core workflow',
  }).first()
  await expect(taskChip).toBeVisible()
  const taskStyle = await taskChip.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      color: style.color,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      maxWidth: style.maxWidth,
      overflow: style.overflow,
      padding: style.padding,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
    }
  })
  expect(taskStyle).toEqual(panelStyle)
})

test('keeps phase creation out of the toolbar and after the phase list', async ({ page }) => {
  await createRoadmap(page, { title: 'Creation placement roadmap', startingPoint: 'blank' })

  await expect(page.getByRole('button', { name: 'Add phase', exact: true })).toHaveCount(0)
  await expect(page.locator('.workspace-bar').getByRole('button', { name: /phase/i })).toHaveCount(0)

  const addAnother = page.getByRole('button', { name: 'Add another phase', exact: true })
  await expect(addAnother).toBeVisible()

  // Zero-phase state still offers creation.
  await page.getByRole('button', { name: 'Phase settings for Planning' }).click()
  await page.getByRole('menuitem', { name: /Delete phase/ }).click()
  await page
    .getByRole('alertdialog', { name: 'Delete phase?' })
    .getByRole('button', { name: 'Delete phase' })
    .click()
  await expect(page.getByRole('button', { name: 'Create first phase' })).toBeVisible()
})

test('explains why Activity is unavailable on a local roadmap', async ({ page }) => {
  await createRoadmap(page, { title: 'Local activity roadmap', startingPoint: 'blank' })

  const tablist = page.getByRole('tablist', { name: 'Workspace views' })
  await expect(tablist.getByRole('tab', { name: 'Roadmap' })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  const activity = page.getByRole('button', { name: 'Activity' })
  await expect(activity).toHaveAttribute('aria-disabled', 'true')
  await expect(activity).toHaveAttribute(
    'title',
    'Activity becomes available after this roadmap is saved or synced.',
  )

  // The reason is described, not printed as a standing row.
  const describedBy = await activity.getAttribute('aria-describedby')
  expect(describedBy).toBeTruthy()
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(
    'Activity becomes available after this roadmap is saved or synced.',
  )
  await expect(page.locator('.activity-helper')).toHaveCount(0)

  // Clicking must not open an empty panel.
  await activity.click({ force: true })
  await expect(page.locator('.side-panel')).toHaveCount(0)
})
