from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one marker in {path}, found {count}: {old[:80]!r}")
    file_path.write_text(text.replace(old, new, 1))


replace_once(
    "apps/web/e2e/accessibility.spec.ts",
    '''/** Pointer drag with enough intermediate moves to clear dnd-kit's activation distance. */
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
''',
    '''/** Pointer drag with enough intermediate moves to clear dnd-kit's activation distance. */
async function dragHandleOnto(page: Page, handle: Locator, target: Locator) {
  // A locator may be present below the current viewport even though
  // boundingBox() returns document-relative coordinates for it. Move the
  // destination into the visible center before calculating mouse positions;
  // otherwise Playwright can faithfully send the pointer outside the viewport
  // and dnd-kit never receives a drag sequence.
  await target.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await handle.scrollIntoViewIfNeeded()

  const from = await handle.boundingBox()
  const to = await target.boundingBox()
  const viewport = page.viewportSize()
  expect(from).not.toBeNull()
  expect(to).not.toBeNull()
  expect(viewport).not.toBeNull()

  const fromX = from!.x + from!.width / 2
  const fromY = from!.y + from!.height / 2
  const toX = to!.x + to!.width / 2
  const toY = to!.y + to!.height / 2

  for (const coordinate of [fromX, toX]) {
    expect(coordinate).toBeGreaterThanOrEqual(0)
    expect(coordinate).toBeLessThanOrEqual(viewport!.width)
  }
  for (const coordinate of [fromY, toY]) {
    expect(coordinate).toBeGreaterThanOrEqual(0)
    expect(coordinate).toBeLessThanOrEqual(viewport!.height)
  }

  const direction = toY >= fromY ? 1 : -1
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  await page.mouse.move(fromX, fromY + direction * 12, { steps: 4 })
  await page.mouse.move(
    toX,
    toY + direction * Math.min(8, to!.height / 4),
    { steps: 12 },
  )
  await page.mouse.up()
}
''',
)

replace_once(
    "apps/web/e2e/clean-beta-smoke.spec.ts",
    '''test('creates a roadmap from the bundled template', async ({ page }) => {
  await createRoadmap(page, { title: 'Template browser roadmap', startingPoint: 'template' })

  await page.getByText('Delivered local-first foundation', { exact: true }).click()
  await expect(page.getByText('RF-001', { exact: true }).first()).toBeVisible()
})
''',
    '''test('creates a roadmap from the bundled template', async ({ page }) => {
  await createRoadmap(page, { title: 'Template browser roadmap', startingPoint: 'template' })

  await expect(page.locator('.phase-head .name')).toHaveText([
    'Define the outcome',
    'Build and test',
    'Release and learn',
  ])
  const expand = page.getByRole('button', { name: 'Expand phase Define the outcome' })
  if (await expand.isVisible()) await expand.click()
  await expect(
    page.getByText('Write one measurable success outcome', { exact: true }),
  ).toBeVisible()
})
''',
)

clean_beta = Path("apps/web/e2e/clean-beta-smoke.spec.ts")
text = clean_beta.read_text()
for old, new in [
    ("hasText: 'Core workflow'", "hasText: 'Focus'"),
    ("name: 'Expand phase Delivered local-first foundation'", "name: 'Expand phase Define the outcome'"),
]:
    if old not in text:
        raise SystemExit(f"Missing clean-beta marker: {old}")
    text = text.replace(old, new)
clean_beta.write_text(text)

replace_once(
    "apps/web/src/components/wizard/CreateWizard.tsx",
    '''  const headingId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
''',
    '''  const headingId = useId()
  const displayNameId = useId()
  const roadmapNameId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
''',
)

wizard = Path("apps/web/src/components/wizard/CreateWizard.tsx")
text = wizard.read_text()
for old, new in [
    ('<label htmlFor="dn">Your display name</label>', '<label htmlFor={displayNameId}>Your display name</label>'),
    ('id="dn"', 'id={displayNameId}'),
    ('<label htmlFor="rn">Roadmap title</label>', '<label htmlFor={roadmapNameId}>Roadmap title</label>'),
    ('id="rn"', 'id={roadmapNameId}'),
]:
    if text.count(old) != 1:
        raise SystemExit(f"Unexpected wizard marker count for {old!r}: {text.count(old)}")
    text = text.replace(old, new, 1)
wizard.write_text(text)

replace_once(
    "apps/web/e2e/helpers.ts",
    '''  await wizard.getByLabel('Display name').fill('Browser Tester')
  await wizard.getByLabel('Roadmap title').fill(title)
  await wizard.getByRole('button', { name: /Continue/ }).click()
''',
    '''  const displayNameInput = wizard.getByLabel('Your display name', { exact: true })
  const roadmapTitleInput = wizard.getByLabel('Roadmap title', { exact: true })
  await displayNameInput.fill('Browser Tester')
  await expect(displayNameInput).toHaveValue('Browser Tester')
  await roadmapTitleInput.fill(title)
  await expect(roadmapTitleInput).toHaveValue(title)
  const continueButton = wizard.getByRole('button', { name: /Continue/ })
  await expect(continueButton).toBeEnabled()
  await continueButton.click()
''',
)
