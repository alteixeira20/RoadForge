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

  // CreateWizard deliberately moves initial focus to the display-name field on
  // a short timer. Wait for that lifecycle to settle before interacting;
  // otherwise a fast CI runner can start filling the title and then have the
  // pending focus callback move focus back to the first field mid-action.
  // This follows the same focus state a real keyboard user sees without adding
  // an arbitrary sleep or retry.
  const displayNameInput = wizard.getByLabel('Your display name', { exact: true })
  const roadmapTitleInput = wizard.getByLabel('Roadmap title', { exact: true })
  await expect(displayNameInput).toBeFocused()

  // Step 1: both identity and roadmap title are required before the wizard
  // advances. Keep this helper coupled to the visible product contract rather
  // than the removed five-step implementation.
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