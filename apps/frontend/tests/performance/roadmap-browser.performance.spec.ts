import { expect, test } from '@playwright/test'
import { PERFORMANCE_ROADMAPS } from './roadmap-fixtures'

const fixture = PERFORMANCE_ROADMAPS.large
const roadmapId = 'rf-performance-large'

test('measures production hydration, typing, search, and phase expansion', async ({ page }) => {
  await page.addInitScript(({ id, roadmap }) => {
    localStorage.setItem('rf:displayName', 'Performance Tester')
    localStorage.setItem(`rf:roadmap:${id}`, JSON.stringify({
      roadmapName: roadmap.roadmapName,
      phases: roadmap.phases,
      saved: false,
      ownerDisplayName: null,
      updatedAt: null,
      isPasswordEnabled: false,
      tagRegistry: roadmap.tagRegistry,
    }))
    sessionStorage.setItem('rf:activeRoadmapId', id)
  }, { id: roadmapId, roadmap: fixture })

  const hydrationStarted = performance.now()
  await page.goto(`/workspace?roadmap=${roadmapId}`)
  await expect(page.getByRole('heading', { name: fixture.roadmapName })).toBeVisible()
  const hydrationMs = performance.now() - hydrationStarted

  const search = page.getByRole('textbox', { name: 'Search roadmap tasks' })
  await search.evaluate((input) => {
    ;(window as typeof window & { __rfPerformanceSearch?: Element }).__rfPerformanceSearch = input
  })
  await search.fill('representative task 999')
  await search.evaluate((input) => (input as HTMLInputElement).setSelectionRange(15, 15))
  const typingStarted = performance.now()
  await search.press('X')
  await expect(search).toHaveValue('representative Xtask 999')
  await expect.poll(() => search.evaluate((input) => (input as HTMLInputElement).selectionStart)).toBe(16)
  const typingMs = performance.now() - typingStarted
  expect(await search.evaluate((input) =>
    (window as typeof window & { __rfPerformanceSearch?: Element }).__rfPerformanceSearch === input,
  )).toBe(true)

  const searchStarted = performance.now()
  await search.fill('representative task')
  await expect(page.getByText('Representative task 1000 in phase 20', { exact: true })).toBeVisible()
  const searchMs = performance.now() - searchStarted

  await search.fill('')
  const phaseToggle = page.getByRole('button', { name: 'Expand phase Performance phase 20' })
  const expansionStarted = performance.now()
  await phaseToggle.click()
  await expect(page.getByText('Representative task 1000 in phase 20', { exact: true })).toBeVisible()
  const expansionMs = performance.now() - expansionStarted

  console.info(`RF-035 browser metrics (ms): ${JSON.stringify({
    hydration: hydrationMs,
    typing: typingMs,
    search: searchMs,
    phaseExpansion: expansionMs,
  })}`)

  expect(hydrationMs).toBeLessThanOrEqual(2_500)
  expect(typingMs).toBeLessThanOrEqual(500)
  expect(searchMs).toBeLessThanOrEqual(2_000)
  expect(expansionMs).toBeLessThanOrEqual(750)
})
