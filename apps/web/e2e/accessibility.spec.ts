import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { createRoadmap } from './helpers'

async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(
    results.violations,
    results.violations
      .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)
      .join('\n'),
  ).toEqual([])
}

test('has no automated WCAG A/AA violations on the landing and blank workspace', async ({ page }) => {
  await page.goto('/')
  await expectNoAccessibilityViolations(page)

  await createRoadmap(page, {
    title: 'Accessible browser roadmap',
    startingPoint: 'blank',
  })
  await expectNoAccessibilityViolations(page)
})

test('labels creation editors and preserves menu focus across Escape', async ({ page }) => {
  await createRoadmap(page, {
    title: 'Keyboard browser roadmap',
    startingPoint: 'blank',
  })

  await page.getByRole('button', { name: 'Add first task' }).click()
  await expect(page.getByRole('textbox', { name: 'New task title' })).toBeFocused()
  await page.keyboard.press('Escape')

  const phaseSettings = page.getByRole('button', { name: 'Phase settings for Planning' })
  await phaseSettings.focus()
  await phaseSettings.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeFocused()
  await expectNoAccessibilityViolations(page)
  await page.keyboard.press('Escape')
  await expect(phaseSettings).toBeFocused()

  await phaseSettings.press('Enter')
  await page.getByRole('menuitem', { name: 'Change color' }).click()
  await expect(page.getByRole('dialog', { name: 'Color settings for Planning' })).toBeVisible()
  await expectNoAccessibilityViolations(page)
  await page.keyboard.press('Escape')
  await expect(phaseSettings).toBeFocused()
})

test('supports keyboard phase reordering through explicit move actions', async ({ page }) => {
  await createRoadmap(page, {
    title: 'Keyboard reorder roadmap',
    startingPoint: 'blank',
  })

  await page.getByRole('button', { name: 'Add another phase', exact: true }).click()
  const phaseName = page.getByRole('textbox', { name: 'Phase name for New phase' })
  await phaseName.fill('Delivery')
  await phaseName.press('Enter')

  const planningSettings = page.getByRole('button', { name: 'Phase settings for Planning' })
  await planningSettings.focus()
  await planningSettings.press('Enter')
  const moveLater = page.getByRole('menuitem', { name: 'Move later' })
  await moveLater.focus()
  await moveLater.press('Enter')

  const phaseNames = await page.locator('.phase-head .name').allTextContents()
  expect(phaseNames).toEqual(['Delivery', 'Planning'])
})

test('honors reduced motion and critical mobile touch targets', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await createRoadmap(page, {
    title: 'Accessible mobile roadmap',
    startingPoint: 'blank',
  })

  const transitionDuration = await page.locator('.phase').evaluate((element) =>
    getComputedStyle(element).transitionDuration,
  )
  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.00001)

  for (const control of [
    page.getByRole('button', { name: 'Add another phase', exact: true }),
    page.getByRole('button', { name: 'Phase settings for Planning' }),
    page.getByRole('button', { name: 'Reorder phase Planning' }),
    page.getByRole('button', { name: 'Add first task' }),
  ]) {
    const bounds = await control.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.width).toBeGreaterThanOrEqual(36)
    expect(bounds!.height).toBeGreaterThanOrEqual(36)
  }
})
