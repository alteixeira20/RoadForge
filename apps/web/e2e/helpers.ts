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
  const wizard = page.getByRole('dialog', { name: 'Create your roadmap' })
  await expect(wizard).toBeVisible()

  // Step 1: both identity and roadmap title are required before the wizard
  // advances. Keep this helper coupled to the visible product contract rather
  // than the removed five-step implementation.
  const displayNameInput = wizard.getByLabel('Your display name', { exact: true })
  const roadmapTitleInput = wizard.getByLabel('Roadmap title', { exact: true })
  await displayNameInput.fill('Browser Tester')
  await expect(displayNameInput).toHaveValue('Browser Tester')
  await roadmapTitleInput.fill(title)
  await expect(roadmapTitleInput).toHaveValue(title)
  const continueButton = wizard.getByRole('button', { name: /Continue/ })
  await expect(continueButton).toBeEnabled()
  await continueButton.click()

  // Step 2 defaults to blank; select the example only when requested.
  const startingPointStep = page.getByRole('dialog', { name: 'Start simple' })
  if (startingPoint === 'template') {
    await startingPointStep.getByRole('button', { name: /Starter example/ }).click()
  }
  await startingPointStep.getByRole('button', { name: 'Create roadmap', exact: true }).click()

  await page.waitForURL(/\/workspace\?roadmap=/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}
