import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { createRoadmap } from './helpers'

/** Pointer drag with enough intermediate moves to clear dnd-kit's activation distance. */
async function dragHandleOnto(page: Page, handle: Locator, target: Locator) {
  const from = await handle.boundingBox()
  const to = await target.boundingBox()
  expect(from).not.toBeNull()
  expect(to).not.toBeNull()

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
  await page.mouse.down()
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2 + 12, { steps: 4 })
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2 + 8, { steps: 12 })
  await page.mouse.up()
}

async function keyboardMove(
  handle: Locator,
  arrow: 'ArrowDown' | 'ArrowUp' = 'ArrowDown',
) {
  await handle.scrollIntoViewIfNeeded()
  await handle.focus()
  await handle.press('Space')
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
  await handle.press(arrow)
  await handle.press('Space')
  await expect(handle).not.toHaveAttribute('aria-pressed', 'true')
}

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

test('reorders phases by dragging only, with no move actions in the phase menu', async ({ page }) => {
  await createRoadmap(page, {
    title: 'Drag reorder roadmap',
    startingPoint: 'blank',
  })

  await page.getByRole('button', { name: 'Add another phase', exact: true }).click()
  const phaseName = page.getByRole('textbox', { name: 'Phase name for New phase' })
  await phaseName.fill('Delivery')
  await phaseName.press('Enter')

  const planningSettings = page.getByRole('button', { name: 'Phase settings for Planning' })
  await planningSettings.click()
  const menu = page.getByRole('menu', { name: 'Phase settings for Planning' })
  await expect(menu.getByRole('menuitem')).toHaveText([/Rename/, /Change color/, /Delete phase/])
  await expect(menu.getByRole('menuitem', { name: /move/i })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await dragHandleOnto(
    page,
    page.getByRole('button', { name: 'Reorder phase Planning' }),
    page.getByRole('button', { name: 'Reorder phase Delivery' }),
  )

  await expect(page.locator('.phase-head .name')).toHaveText(['Delivery', 'Planning'])
  await expect(page.locator('.phase-head .num')).toHaveText(['01', '02'])
})

test('reorders phases, tasks, and subtasks with Space, Arrow, Space', async ({ page }) => {
  await createRoadmap(page, {
    title: 'Keyboard drag roadmap',
    startingPoint: 'blank',
  })

  await page.getByRole('button', { name: 'Add first task' }).click()
  await page.getByRole('textbox', { name: 'New task title' }).fill('First task')
  await page.getByRole('textbox', { name: 'New task title' }).press('Enter')
  await page.getByRole('button', { name: 'Add task' }).click()
  await page.getByRole('textbox', { name: 'New task title' }).fill('Second task')
  await page.getByRole('textbox', { name: 'New task title' }).press('Enter')

  const firstTask = page.locator('.task').filter({ hasText: 'First task' }).first()
  const secondTask = page.locator('.task').filter({ hasText: 'Second task' }).first()
  await secondTask.getByRole('button', { name: 'Collapse task' }).click()
  await secondTask.getByRole('button', { name: 'Expand task' }).click()
  await secondTask.getByRole('button', { name: 'Add subtask' }).click()
  await page.getByRole('textbox', { name: 'Subtask title' }).fill('First subtask')
  await page.getByRole('textbox', { name: 'Subtask title' }).press('Enter')
  await secondTask.getByRole('button', { name: 'Add subtask' }).click()
  await page.getByRole('textbox', { name: 'Subtask title' }).fill('Second subtask')
  await page.getByRole('textbox', { name: 'Subtask title' }).press('Enter')

  await keyboardMove(
    secondTask
      .locator('.subtask-row')
      .filter({ hasText: 'First subtask' })
      .locator('.subtask-drag-handle[role="button"]'),
  )
  await expect(secondTask.locator('.subtask-title')).toHaveText([
    'Second subtask',
    'First subtask',
  ])

  await secondTask.getByRole('button', { name: 'Collapse task' }).click()
  await keyboardMove(firstTask.locator('.drag-handle[role="button"]'))
  await expect(page.locator('.task-row .title')).toHaveText(['Second task', 'First task'])

  await page.getByRole('button', { name: 'Add another phase', exact: true }).click()
  const phaseName = page.getByRole('textbox', { name: 'Phase name for New phase' })
  await phaseName.fill('Delivery')
  await phaseName.press('Enter')
  await page.getByRole('button', { name: 'Collapse phase Planning' }).click()
  await page.getByRole('button', { name: 'Collapse phase Delivery' }).click()

  await keyboardMove(
    page.getByRole('button', { name: 'Reorder phase Delivery' }),
    'ArrowUp',
  )
  await expect(page.locator('.phase-head .name')).toHaveText(['Delivery', 'Planning'])
  await expect(page.locator('.phase-head .num')).toHaveText(['01', '02'])
})

test('reorders tasks and subtasks by drag only and persists local order', async ({ page }) => {
  await createRoadmap(page, {
    title: 'Drag-only task roadmap',
    startingPoint: 'blank',
  })

  await page.getByRole('button', { name: 'Add first task' }).click()
  await page.getByRole('textbox', { name: 'New task title' }).fill('First task')
  await page.getByRole('textbox', { name: 'New task title' }).press('Enter')
  await page.getByRole('button', { name: 'Add task' }).click()
  await page.getByRole('textbox', { name: 'New task title' }).fill('Second task')
  await page.getByRole('textbox', { name: 'New task title' }).press('Enter')
  await page
    .locator('.task')
    .filter({ hasText: 'Second task' })
    .first()
    .getByRole('button', { name: 'Collapse task' })
    .click()

  await expect(
    page.getByRole('button', { name: /move (earlier|later|up|down)/i }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', {
      name: /move (phase|task|subtask).*(earlier|later|up|down)/i,
    }),
  ).toHaveCount(0)

  const firstTask = page.locator('.task').filter({ hasText: 'First task' }).first()
  const secondTask = page.locator('.task').filter({ hasText: 'Second task' }).first()
  await dragHandleOnto(
    page,
    secondTask.locator('.drag-handle'),
    firstTask.locator('.drag-handle'),
  )

  await expect(page.locator('.task-row .title')).toHaveText(['Second task', 'First task'])
  await expect(page.locator('.task-row .task-num')).toHaveText(['1.1', '1.2'])

  await page.reload()
  await expect(page.locator('.task-row .title')).toHaveText(['Second task', 'First task'])
  await expect(page.locator('.task-row .task-num')).toHaveText(['1.1', '1.2'])

  const reorderedTask = page.locator('.task').filter({ hasText: 'Second task' }).first()
  await reorderedTask.getByRole('button', { name: 'Expand task' }).click()
  await reorderedTask.getByRole('button', { name: 'Add subtask' }).click()
  await page.getByRole('textbox', { name: 'Subtask title' }).fill('First subtask')
  await page.getByRole('textbox', { name: 'Subtask title' }).press('Enter')
  await reorderedTask.getByRole('button', { name: 'Add subtask' }).click()
  await page.getByRole('textbox', { name: 'Subtask title' }).fill('Second subtask')
  await page.getByRole('textbox', { name: 'Subtask title' }).press('Enter')

  await expect(
    page.getByRole('button', { name: /move (earlier|later|up|down)/i }),
  ).toHaveCount(0)
  await expect(page.locator('.subtask-move')).toHaveCount(0)

  const firstSubtask = reorderedTask.locator('.subtask-row').filter({
    hasText: 'First subtask',
  })
  const secondSubtask = reorderedTask.locator('.subtask-row').filter({
    hasText: 'Second subtask',
  })
  await dragHandleOnto(
    page,
    secondSubtask.locator('.subtask-drag-handle'),
    firstSubtask.locator('.subtask-drag-handle'),
  )

  await expect(reorderedTask.locator('.subtask-title')).toHaveText([
    'Second subtask',
    'First subtask',
  ])
  await expect(reorderedTask.locator('.subtask-row .task-num')).toHaveText([
    '1.1.1',
    '1.1.2',
  ])

  await page.reload()
  const persistedTask = page.locator('.task').filter({ hasText: 'Second task' }).first()
  if (await persistedTask.getByRole('button', { name: 'Expand task' }).isVisible()) {
    await persistedTask.getByRole('button', { name: 'Expand task' }).click()
  }
  await expect(persistedTask.locator('.subtask-title')).toHaveText([
    'Second subtask',
    'First subtask',
  ])
  await expect(persistedTask.locator('.subtask-row .task-num')).toHaveText([
    '1.1.1',
    '1.1.2',
  ])
})

test('reorders tags by drag and by keyboard, with no move actions', async ({ page }) => {
  await createRoadmap(page, {
    title: 'Tag drag roadmap',
    startingPoint: 'blank',
  })

  await page.getByRole('tab', { name: 'Tags' }).click()

  for (const label of ['Alpha', 'Beta', 'Gamma']) {
    await page.getByRole('button', { name: 'New tag' }).click()
    await page.getByRole('textbox', { name: 'New tag label' }).fill(label)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
  }

  await expect(
    page.getByRole('button', { name: /move tag.*(earlier|later)/i }),
  ).toHaveCount(0)
  await expect(page.locator('.tag-registry-id')).toHaveText(['alpha', 'beta', 'gamma'])

  await dragHandleOnto(
    page,
    page.getByRole('button', { name: 'Reorder tag Alpha' }),
    page.getByRole('button', { name: 'Reorder tag Gamma' }),
  )
  await expect(page.locator('.tag-registry-id')).toHaveText(['beta', 'gamma', 'alpha'])

  await page.reload()
  await page.getByRole('tab', { name: 'Tags' }).click()
  await expect(page.locator('.tag-registry-id')).toHaveText(['beta', 'gamma', 'alpha'])

  await keyboardMove(page.getByRole('button', { name: 'Reorder tag Gamma' }), 'ArrowUp')
  await expect(page.locator('.tag-registry-id')).toHaveText(['gamma', 'beta', 'alpha'])
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
