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

/**
 * Drives a keyboard drag handle through Space (pick up) -> Arrow (move) ->
 * Space (drop), with no artificial delay between them, and asserts pickup
 * state, live announcements, and post-drop focus along the way.
 *
 * dnd-kit's own KeyboardSensor turned out to have two confirmed timing
 * defects: its drop-target (`over`) resolution depends on an async
 * (ResizeObserver-driven) remeasurement that can still be in flight when
 * Space (drop) is processed right after Arrow, and its own keydown listener
 * is registered via `setTimeout(0)` (not synchronously with the Space that
 * constructs it), so a following keydown dispatched before that timer fires
 * is missed entirely - confirmed via direct instrumentation to affect not
 * just Arrow but the drop-ending Space itself under load. Both are
 * reproducible regardless of collision algorithm, measuring strategy, or
 * forcing a synchronous React flush.
 *
 * `hooks/useKeyboardReorder.ts` sidesteps both by not routing the pickup/
 * move/drop cycle through dnd-kit's KeyboardSensor at all: a plain React
 * `onKeyDown` on the drag handle (reliable, non-deferred delegation) drives
 * the whole cycle, and the committed order comes from the stable pre-drag
 * id order plus plain arithmetic. dnd-kit's KeyboardSensor is no longer
 * registered - only PointerSensor remains, for pointer/touch drags.
 */
// `[aria-live="assertive"]` alone isn't unique to our own announcer: each
// dnd-kit `DndContext` mounts its own `#DndLiveRegion-N` (one per phase,
// task list, subtask list, and the tags list) for its default pointer/touch
// drag announcements, and Next.js mounts `#__next-route-announcer__` for
// route changes - neither has anything to do with useKeyboardReorder.
// Scoping out both isolates exactly our own single global live region (see
// GlobalKeyboardReorderAnnouncer).
function keyboardReorderLiveRegion(page: Page): Locator {
  return page.locator(
    '[aria-live="assertive"]:not([id^="DndLiveRegion"]):not(#__next-route-announcer__)',
  )
}

// A single workspace-wide live region (mounted once, fed by
// useKeyboardReorderCoordinator - see GlobalKeyboardReorderAnnouncer) backs
// every list's announcements; its text doesn't clear after a drag
// completes, so the "current" text can be stale relative to a step that
// hasn't announced anything new yet. Diffing before/after each key press
// isolates exactly the announcement that step caused. `allTextContents()`
// (rather than `textContent()` on a single locator) keeps this robust even
// if that invariant regresses back to one-per-list.
async function announcementTexts(page: Page): Promise<string[]> {
  return keyboardReorderLiveRegion(page).allTextContents()
}

// Waits (retrying against the real DOM, not a fixed delay) for a live-region
// text that is both new relative to `before` and matches `pattern` - targets
// exactly the announcement this step caused, immune to an unrelated stale
// announcer elsewhere settling into the DOM around the same moment.
async function waitForAnnouncementMatching(
  page: Page,
  before: string[],
  pattern: RegExp,
): Promise<string> {
  let matched: string | undefined
  await expect
    .poll(
      async () => {
        const after = await announcementTexts(page)
        matched = after.find((text) => !before.includes(text) && pattern.test(text))
        return matched !== undefined
      },
      { message: `waiting for a new announcement matching ${pattern}` },
    )
    .toBe(true)
  return matched!
}

async function keyboardMove(
  handle: Locator,
  arrow: 'ArrowDown' | 'ArrowUp' = 'ArrowDown',
) {
  const page = handle.page()

  await handle.scrollIntoViewIfNeeded()
  await handle.focus()

  const beforePickup = await announcementTexts(page)
  await handle.press('Space')
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
  await waitForAnnouncementMatching(page, beforePickup, /^Picked up/)

  const beforeMove = await announcementTexts(page)
  await handle.press(arrow)
  await waitForAnnouncementMatching(page, beforeMove, /moved to position \d+ of \d+\.$/)

  const beforeDrop = await announcementTexts(page)
  await handle.press('Space')
  await expect(handle).not.toHaveAttribute('aria-pressed', 'true')
  await waitForAnnouncementMatching(page, beforeDrop, /^Dropped/)

  // Meaningful focus after drop: the same handle (same DOM node - React
  // preserves it across reordering since the list item's `key` is stable)
  // stays focused, so keyboard/screen-reader users aren't dropped
  // somewhere unexpected.
  await expect(handle).toBeFocused()
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

  // New subtasks are inserted immediately after their parent task, so
  // "First subtask" (added before "Second subtask") ends up *below* it -
  // confirm that starting position before moving, so ArrowUp below is a
  // genuine move (index 1 -> 0), not a boundary no-op that would
  // coincidentally already match a same-order final assertion.
  await expect(secondTask.locator('.subtask-title')).toHaveText([
    'Second subtask',
    'First subtask',
  ])
  await keyboardMove(
    secondTask
      .locator('.subtask-row')
      .filter({ hasText: 'First subtask' })
      .locator('.subtask-drag-handle[role="button"]'),
    'ArrowUp',
  )
  await expect(secondTask.locator('.subtask-title')).toHaveText([
    'First subtask',
    'Second subtask',
  ])

  await secondTask.getByRole('button', { name: 'Collapse task' }).click()
  // Confirm the collapse actually committed (not just that the click
  // dispatched): the ArrowDown swap target depends on "Second task" having
  // finished collapsing, not on "First task"'s own (unchanged) row.
  await expect(secondTask.getByRole('button', { name: 'Expand task' })).toBeVisible()
  await keyboardMove(firstTask.locator('.drag-handle[role="button"]'))
  await expect(page.locator('.task-row .title')).toHaveText(['Second task', 'First task'])

  await page.getByRole('button', { name: 'Add another phase', exact: true }).click()
  const phaseName = page.getByRole('textbox', { name: 'Phase name for New phase' })
  await phaseName.fill('Delivery')
  await phaseName.press('Enter')
  await page.getByRole('button', { name: 'Collapse phase Planning' }).click()
  await expect(page.getByRole('button', { name: 'Expand phase Planning' })).toBeVisible()
  await page.getByRole('button', { name: 'Collapse phase Delivery' }).click()
  await expect(page.getByRole('button', { name: 'Expand phase Delivery' })).toBeVisible()
  await keyboardMove(
    page.getByRole('button', { name: 'Reorder phase Delivery' }),
    'ArrowUp',
  )
  await expect(page.locator('.phase-head .name')).toHaveText(['Delivery', 'Planning'])
  await expect(page.locator('.phase-head .num')).toHaveText(['01', '02'])
})

test('keyboard reorder previews without persisting until Drop, and Escape discards it', async ({ page }) => {
  await createRoadmap(page, {
    title: 'Preview then commit roadmap',
    startingPoint: 'blank',
  })

  await page.getByRole('button', { name: 'Add another phase', exact: true }).click()
  const phaseName = page.getByRole('textbox', { name: 'Phase name for New phase' })
  await phaseName.fill('Delivery')
  await phaseName.press('Enter')
  await expect(page.locator('.phase-head .name')).toHaveText(['Planning', 'Delivery'])

  const handle = page.getByRole('button', { name: 'Reorder phase Planning' })
  await handle.focus()
  const beforePickup = await announcementTexts(page)
  await handle.press('Space')
  await waitForAnnouncementMatching(page, beforePickup, /^Picked up/)

  const beforeMove = await announcementTexts(page)
  await handle.press('ArrowDown')
  await waitForAnnouncementMatching(page, beforeMove, /moved to position/)
  // Arrow updates the visible preview order immediately...
  await expect(page.locator('.phase-head .name')).toHaveText(['Delivery', 'Planning'])

  // ...but reloading before Drop must show the committed order untouched -
  // zero durable writes happened during the preview.
  await page.reload()
  await expect(page.locator('.phase-head .name')).toHaveText(['Planning', 'Delivery'])

  // Escape during an active preview must also leave zero durable writes.
  const handleAgain = page.getByRole('button', { name: 'Reorder phase Planning' })
  await handleAgain.focus()
  await handleAgain.press('Space')
  await handleAgain.press('ArrowDown')
  await expect(page.locator('.phase-head .name')).toHaveText(['Delivery', 'Planning'])

  const beforeCancel = await announcementTexts(page)
  await handleAgain.press('Escape')
  await waitForAnnouncementMatching(page, beforeCancel, /cancelled/)
  await expect(handleAgain).not.toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.phase-head .name')).toHaveText(['Planning', 'Delivery'])

  await page.reload()
  await expect(page.locator('.phase-head .name')).toHaveText(['Planning', 'Delivery'])
})

test('enforces one workspace-wide keyboard reorder session, cancelled by a pointer drag elsewhere', async ({ page }) => {
  await createRoadmap(page, {
    title: 'Single session roadmap',
    startingPoint: 'blank',
  })

  await page.getByRole('button', { name: 'Add first task' }).click()
  await page.getByRole('textbox', { name: 'New task title' }).fill('First task')
  await page.getByRole('textbox', { name: 'New task title' }).press('Enter')
  // A newly created task starts expanded, and its drag handle is disabled
  // while expanded - collapse it first, same as the drag-only tests above.
  const firstTask = page.locator('.task').filter({ hasText: 'First task' }).first()
  await firstTask.getByRole('button', { name: 'Collapse task' }).click()
  await expect(firstTask.getByRole('button', { name: 'Expand task' })).toBeVisible()

  await page.getByRole('button', { name: 'Add another phase', exact: true }).click()
  const phaseName = page.getByRole('textbox', { name: 'Phase name for New phase' })
  await phaseName.fill('Delivery')
  await phaseName.press('Enter')

  // Exactly one live region for the whole workspace, not one per list.
  await expect(keyboardReorderLiveRegion(page)).toHaveCount(1)

  const phaseHandle = page.getByRole('button', { name: 'Reorder phase Planning' })
  await phaseHandle.focus()
  await phaseHandle.press('Space')
  await expect(phaseHandle).toHaveAttribute('aria-pressed', 'true')

  // Starting a *different* list's session must cancel the phase session -
  // only one handle is ever pressed at a time workspace-wide.
  const taskHandle = firstTask.locator('.drag-handle[role="button"]')
  await taskHandle.focus()
  const beforeTakeover = await announcementTexts(page)
  await taskHandle.press('Space')
  await waitForAnnouncementMatching(page, beforeTakeover, /^Picked up/)
  await expect(phaseHandle).not.toHaveAttribute('aria-pressed', 'true')
  await expect(taskHandle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[aria-pressed="true"]')).toHaveCount(1)

  // A pointer drag starting elsewhere must cancel the still-active
  // keyboard session too.
  await dragHandleOnto(
    page,
    page.getByRole('button', { name: 'Reorder phase Delivery' }),
    page.getByRole('button', { name: 'Reorder phase Planning' }),
  )
  await expect(taskHandle).not.toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[aria-pressed="true"]')).toHaveCount(0)
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
