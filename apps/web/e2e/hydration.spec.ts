import { expect, test, type Page } from '@playwright/test'
import { createRoadmap } from './helpers'

const HYDRATION_PATTERN =
  /hydrated but some attributes|didn't match|hydration|DndDescribedBy/i
const EXPECTED_CSP_REPORT_ONLY_WARNING =
  "The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy."

function captureBrowserErrors(page: Page) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  return {
    expectNone() {
      const allErrors = [...consoleErrors, ...pageErrors]
      const unexpectedErrors = allErrors.filter(
        (message) => message !== EXPECTED_CSP_REPORT_ONLY_WARNING,
      )
      expect(
        allErrors.filter((message) => HYDRATION_PATTERN.test(message)),
        `Hydration-related browser errors:\n${allErrors.join('\n')}`,
      ).toEqual([])
      expect(
        unexpectedErrors,
        `Unexpected browser errors:\n${unexpectedErrors.join('\n')}`,
      ).toEqual([])
    },
  }
}

async function ensurePhaseExpanded(page: Page, phaseName: string) {
  const expand = page.getByRole('button', { name: `Expand phase ${phaseName}` })
  if (await expand.isVisible()) {
    await expand.click()
  }
  await expect(
    page.getByRole('button', { name: `Collapse phase ${phaseName}` }),
  ).toBeVisible()
}

test('keeps drag descriptions deterministic across navigation and reload', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)

  await createRoadmap(page, {
    title: 'Hydration template roadmap',
    startingPoint: 'template',
  })
  await ensurePhaseExpanded(page, 'Delivered local-first foundation')
  await ensurePhaseExpanded(page, 'Delivered collaboration and server persistence')

  const phaseHandles = page.getByRole('button', { name: /Reorder phase/ })
  await expect(phaseHandles).toHaveCount(11)
  await expect(phaseHandles.first()).toHaveAttribute(
    'aria-describedby',
    'roadmap-phases',
  )

  const firstPhase = page.locator('.phase').filter({
    hasText: 'Delivered local-first foundation',
  }).first()
  const taskHandles = firstPhase.locator('.task-row .drag-handle[role="button"]')
  await expect(taskHandles.first()).toBeVisible()
  await expect(taskHandles.first()).toHaveAttribute(
    'aria-describedby',
    'phase-tasks-p01',
  )

  await page.reload()
  await expect(
    page.getByRole('button', { name: /Reorder phase/ }).first(),
  ).toHaveAttribute('aria-describedby', 'roadmap-phases')
  await expect(
    page
      .locator('.phase')
      .filter({ hasText: 'Delivered local-first foundation' })
      .first()
      .locator('.task-row .drag-handle[role="button"]')
      .first(),
  ).toHaveAttribute('aria-describedby', 'phase-tasks-p01')

  await createRoadmap(page, {
    title: 'Hydration blank roadmap',
    startingPoint: 'blank',
  })
  await page.getByRole('button', { name: 'Add another phase', exact: true }).click()
  const phaseName = page.getByRole('textbox', { name: 'Phase name for New phase' })
  await phaseName.fill('Delivery')
  await phaseName.press('Enter')
  await page.getByRole('button', { name: 'Add first task' }).first().click()
  await page.getByRole('textbox', { name: 'New task title' }).fill('Hydrated task')
  await page.getByRole('textbox', { name: 'New task title' }).press('Enter')
  await expect(page.getByRole('button', { name: /Reorder phase/ })).toHaveCount(2)

  browserErrors.expectNone()
})
