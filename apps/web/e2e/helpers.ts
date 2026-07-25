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
