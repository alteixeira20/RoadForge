import { expect, test, type Page } from '@playwright/test'
import { createRoadmap } from './helpers'

const CSP_ERROR_PATTERN =
  /content security policy|refused to (?:execute|load)|violat(?:e|ion).*script-src/i

function captureCspErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && CSP_ERROR_PATTERN.test(message.text())) {
      errors.push(message.text())
    }
  })
  return errors
}

function extractNonce(policy: string): string {
  const match = policy.match(/script-src[^;]*'nonce-([^']+)'/)
  expect(match, `Expected a script nonce in CSP: ${policy}`).not.toBeNull()
  return match![1]
}

test('production documents enforce a fresh nonce CSP without console violations', async ({ page }) => {
  const cspErrors = captureCspErrors(page)
  const response = await page.goto('/')
  expect(response).not.toBeNull()

  const headers = response!.headers()
  const policy = headers['content-security-policy']
  expect(policy).toBeTruthy()
  expect(headers['content-security-policy-report-only']).toBeUndefined()
  expect(headers['cache-control']).toContain('no-store')
  expect(policy).toContain("script-src 'self'")
  expect(policy).toContain("'strict-dynamic'")
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/)
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-eval'/)
  const firstNonce = extractNonce(policy)

  const executableInlineNonces = await page.locator('script:not([src])').evaluateAll((scripts) =>
    scripts
      .filter((script) => {
        const type = (script.getAttribute('type') ?? '').toLowerCase()
        return type !== 'application/json' && type !== 'application/ld+json'
      })
      .map((script) => (script as HTMLScriptElement).nonce),
  )
  expect(executableInlineNonces.length).toBeGreaterThan(0)
  expect(new Set(executableInlineNonces)).toEqual(new Set([firstNonce]))

  await expect(page.getByRole('button', { name: 'Create roadmap' }).first()).toBeVisible()

  const reloadResponse = await page.reload()
  expect(reloadResponse).not.toBeNull()
  const secondPolicy = reloadResponse!.headers()['content-security-policy']
  const secondNonce = extractNonce(secondPolicy)
  expect(secondNonce).not.toBe(firstNonce)

  await createRoadmap(page, {
    title: 'CSP protected roadmap',
    startingPoint: 'blank',
  })
  await page.getByRole('button', { name: 'Add first task' }).click()
  await page.getByRole('textbox', { name: 'New task title' }).fill('Nonce protected task')
  await page.getByRole('textbox', { name: 'New task title' }).press('Enter')
  await expect(page.getByText('Nonce protected task', { exact: true })).toBeVisible()

  expect(cspErrors, `Unexpected CSP browser errors:\n${cspErrors.join('\n')}`).toEqual([])
})

test('production CSP blocks a parser-injected nonce-free inline script', async ({ page }) => {
  const cspErrors = captureCspErrors(page)
  await page.route('**/', async (route) => {
    const response = await route.fetch()
    const body = await response.text()
    const injectedBody = body.replace(
      '</head>',
      "<script>window.__roadforgeCspProbe = 'executed'</script></head>",
    )
    expect(injectedBody).not.toBe(body)
    await route.fulfill({ response, body: injectedBody })
  }, { times: 1 })

  const response = await page.goto('/')
  expect(response).not.toBeNull()
  expect(response!.headers()['content-security-policy']).toBeTruthy()

  const result = await page.evaluate(() => {
    const target = window as typeof window & { __roadforgeCspProbe?: string }
    return target.__roadforgeCspProbe ?? 'blocked'
  })
  expect(result).toBe('blocked')

  await expect.poll(() => cspErrors.length).toBeGreaterThan(0)
  expect(cspErrors.some((error) => /inline script|script-src|content security policy/i.test(error)))
    .toBe(true)
})
