import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import { dirname } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
let baseUrl = ''

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {}
    await wait(100)
  }
  throw new Error(`Timed out waiting for ${baseUrl}`)
}

async function availablePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function stopServer(server) {
  if (server.exitCode !== null) return
  const exit = once(server, 'exit')
  server.kill('SIGTERM')
  await Promise.race([exit, wait(5_000)])
}

async function collectViewport(page, viewport) {
  await page.setViewportSize(viewport)
  await page.goto(baseUrl)
  await page.evaluate(() => document.fonts.ready)
  await page.locator('.meta-row').waitFor()

  return page.evaluate(() => {
    const box = (element) => {
      const rect = element.getBoundingClientRect()
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height }
    }
    const metadata = document.querySelector('.meta-row')
    const ctas = document.querySelector('.ctas')
    const hero = document.querySelector('#hero')
    const howHeading = document.querySelector('#how h2')
    const preview = document.querySelector('.preview')
    const previewContent = document.querySelector('.preview-mini')
    const expectedMetadata = ['No account required', 'Local-first', 'Portable exports', 'Self-host for team use']
    const metadataItems = [...metadata.querySelectorAll('span')]
    const metadataBox = box(metadata)
    const ctasBox = box(ctas)
    const previewBox = box(preview)
    const previewContentBox = box(previewContent)
    const previewChildrenFit = [...previewContent.querySelectorAll('*')].every((element) => {
      const child = box(element)
      return child.top >= previewContentBox.top - 1 && child.bottom <= previewContentBox.bottom + 1 && child.left >= previewContentBox.left - 1 && child.right <= previewContentBox.right + 1
    })
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      metadataBox,
      ctaPreviewGap: previewBox.top - ctasBox.bottom,
      previewMetadataGap: metadataBox.top - previewBox.bottom,
      heroBox: box(hero),
      howHeadingBox: box(howHeading),
      previewBox,
      previewContentBox,
      previewContentScrollHeight: previewContent.scrollHeight,
      previewContentClientHeight: previewContent.clientHeight,
      metadataVisible: expectedMetadata.every((text) => metadataItems.some((item) => item.textContent.includes(text) && box(item).top >= 0 && box(item).bottom <= window.innerHeight)),
      previewUnclipped: previewContent.scrollHeight <= previewContent.clientHeight + 1 && previewChildrenFit,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth && getComputedStyle(document.body).overflowX !== 'hidden',
    }
  })
}

test('desktop Hero keeps metadata within the initial viewport', { timeout: 60_000 }, async (t) => {
  const port = await availablePort()
  baseUrl = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['scripts/serve-standalone.mjs'], {
    cwd: appRoot,
    env: { ...process.env, PORT: String(port), HOSTNAME: '127.0.0.1' },
    stdio: 'ignore',
  })
  let browser

  try {
    await waitForServer()
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN })
    const page = await browser.newPage()

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
    ]) {
      const result = await collectViewport(page, viewport)
      const bottomInset = result.viewport.height - result.metadataBox.bottom
      const measurement = `${viewport.width}x${viewport.height}: metadata inset ${bottomInset.toFixed(1)}px; How it works heading top ${result.howHeadingBox.top.toFixed(1)}px; preview content ${result.previewContentClientHeight}/${result.previewContentScrollHeight}px`
      t.diagnostic(measurement)
      console.log(measurement)
      assert.equal(result.metadataVisible, true, `${viewport.width}x${viewport.height}: all metadata items must be visible`)
      assert.ok(bottomInset >= 24, `${viewport.width}x${viewport.height}: metadata needs a 24px bottom inset, received ${bottomInset}px`)
      assert.ok(bottomInset <= 96, `${viewport.width}x${viewport.height}: metadata must stay within 96px of the viewport bottom, received ${bottomInset}px`)
      assert.ok(result.heroBox.bottom >= result.viewport.height, `${viewport.width}x${viewport.height}: Hero must fill the viewport`)
      assert.ok(result.howHeadingBox.top >= result.viewport.height + 24, `${viewport.width}x${viewport.height}: How it works must begin at least 24px below the viewport`)
      assert.ok(Math.abs(result.ctaPreviewGap - result.previewMetadataGap) <= 1, `${viewport.width}x${viewport.height}: preview spacing must be equal (${result.ctaPreviewGap}px vs ${result.previewMetadataGap}px)`)
      assert.equal(result.previewUnclipped, true, `${viewport.width}x${viewport.height}: preview content must not be clipped`)
      assert.equal(result.horizontalOverflow, false, `${viewport.width}x${viewport.height}: page must not overflow horizontally`)
    }

    await page.goto(`${baseUrl}/#hero`)
    await page.evaluate(() => document.fonts.ready)
    const landingBrand = await page.evaluate(() => {
      const brand = document.querySelector('.site-header .brand')
      const hero = document.querySelector('#hero')
      const header = document.querySelector('.site-header')
      return { href: brand?.getAttribute('href'), hash: window.location.hash, heroTop: hero?.getBoundingClientRect().top, headerBottom: header?.getBoundingClientRect().bottom }
    })
    assert.equal(landingBrand.href, '/#hero', 'landing brand must target the Hero')
    assert.equal(landingBrand.hash, '#hero', 'direct /#hero navigation must retain the Hero hash')
    assert.ok(landingBrand.heroTop >= landingBrand.headerBottom - 1, 'the Hero must remain below the sticky header')

    await page.goto(`${baseUrl}/workspace`)
    assert.equal(await page.locator('.brand-mini').getAttribute('href'), '/#hero', 'workspace brand must return to the Hero')
  } finally {
    await Promise.allSettled([browser?.close(), stopServer(server)])
  }
})
