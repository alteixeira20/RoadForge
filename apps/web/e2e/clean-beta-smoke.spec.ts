import { expect, test, type Page } from '@playwright/test'

const ISSUE_CHOOSER_URL = 'https://github.com/alteixeira20/RoadForge/issues/new/choose'

async function createRoadmap(
  page: Page,
  {
    title,
    startingPoint,
  }: {
    title: string
    startingPoint: 'blank' | 'template'
  },
) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create roadmap' }).first().click()
  await page.getByLabel('Display name').fill('Browser Tester')
  await page.getByRole('button', { name: /Continue/ }).click()
  await page.getByLabel('Roadmap title').fill(title)
  await page.getByRole('button', { name: /Continue/ }).click()
  if (startingPoint === 'template') {
    await page.getByRole('button', { name: /Use RoadForge template/ }).click()
  }
  await page.getByRole('button', { name: /Continue/ }).click()
  await page.getByRole('button', { name: /Continue/ }).click()
  await page.getByRole('button', { name: /Open roadmap/ }).click()
  await page.waitForURL(/\/workspace\?roadmap=/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

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

  await page.getByRole('button', { name: 'Add phase', exact: true }).click()
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

    const addPhase = page.getByRole('button', { name: /Add phase/ })
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
    }
  })
}
