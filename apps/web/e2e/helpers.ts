import { expect, type Page } from '@playwright/test'

export async function createRoadmap(
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

  // Step 1: both identity and roadmap title are required before the wizard
  // advances. Keep this helper coupled to the visible product contract rather
  // than the removed five-step implementation.
  await page.getByLabel('Display name').fill('Browser Tester')
  await page.getByLabel('Roadmap title').fill(title)
  await page.getByRole('button', { name: /Continue/ }).click()

  // Step 2 defaults to blank; select the example only when requested.
  if (startingPoint === 'template') {
    await page.getByRole('button', { name: /Starter example/ }).click()
  }
  await page.getByRole('button', { name: /Create roadmap/ }).click()

  await page.waitForURL(/\/workspace\?roadmap=/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}
