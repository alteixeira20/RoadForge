import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import net from 'node:net'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const chromium = process.env.CHROMIUM_BIN ?? '/snap/bin/chromium'
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

async function waitForBrowser(debugPort) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`)
      if (response.ok) return
    } catch {}
    await wait(100)
  }
  throw new Error(`Timed out waiting for Chromium on ${debugPort}`)
}

async function stopProcess(process) {
  if (process.exitCode !== null) return
  const exit = once(process, 'exit')
  process.kill('SIGTERM')
  await Promise.race([exit, wait(5_000)])
}

async function openPage(debugPort) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })
  if (!response.ok) throw new Error(`Could not open Chromium page: ${response.status}`)
  const page = await response.json()
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await once(socket, 'open')
  let sequence = 0
  const pending = new Map()
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })

  return {
    async send(method, params = {}) {
      const id = ++sequence
      const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
      socket.send(JSON.stringify({ id, method, params }))
      return result
    },
    close() {
      socket.close()
    },
  }
}

async function evaluate(page, expression) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function collectViewport(page, viewport) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await page.send('Page.navigate', { url: `${baseUrl}/` })
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await evaluate(page, 'document.readyState')
    if (ready === 'complete') break
    await wait(50)
  }
  await evaluate(page, 'document.fonts.ready')

  return evaluate(page, `(() => {
    const box = (element) => {
      const rect = element.getBoundingClientRect()
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height }
    }
    const metadata = document.querySelector('.meta-row')
    const hero = document.querySelector('#hero')
    const howHeading = document.querySelector('#how h2')
    const preview = document.querySelector('.preview')
    const previewContent = document.querySelector('.preview-mini')
    const expectedMetadata = ['No account required', 'Runs locally', 'Portable exports', 'Non-commercial source available']
    const metadataItems = [...metadata.querySelectorAll('span')]
    const metadataBox = box(metadata)
    const previewBox = box(preview)
    const previewContentBox = box(previewContent)
    const previewChildrenFit = [...previewContent.querySelectorAll('*')].every((element) => {
      const child = box(element)
      return child.top >= previewContentBox.top - 1 && child.bottom <= previewContentBox.bottom + 1 && child.left >= previewContentBox.left - 1 && child.right <= previewContentBox.right + 1
    })
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      metadataBox,
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
  })()`)
}

test('desktop Hero keeps metadata within the initial viewport', { timeout: 60_000 }, async (t) => {
  const port = await availablePort()
  const debugPort = await availablePort()
  baseUrl = `http://127.0.0.1:${port}`
  const browserDataDir = await mkdtemp(join(tmpdir(), 'roadforge-hero-browser-'))
  const server = spawn('pnpm', ['exec', 'next', 'start', '--port', String(port)], { cwd: appRoot, stdio: 'pipe' })
  const browser = spawn(chromium, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${browserDataDir}`,
    'about:blank',
  ], { stdio: 'pipe' })
  let page

  try {
    await waitForServer()
    await waitForBrowser(debugPort)
    page = await openPage(debugPort)
    await page.send('Page.enable')
    await page.send('Runtime.enable')

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
      assert.equal(result.previewUnclipped, true, `${viewport.width}x${viewport.height}: preview content must not be clipped`)
      assert.equal(result.horizontalOverflow, false, `${viewport.width}x${viewport.height}: page must not overflow horizontally`)
    }

    await page.send('Page.navigate', { url: `${baseUrl}/#hero` })
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await evaluate(page, 'document.readyState') === 'complete') break
      await wait(50)
    }
    await evaluate(page, 'document.fonts.ready')
    const landingBrand = await evaluate(page, `(() => {
      const brand = document.querySelector('.site-header .brand')
      const hero = document.querySelector('#hero')
      const header = document.querySelector('.site-header')
      return { href: brand?.getAttribute('href'), hash: window.location.hash, heroTop: hero?.getBoundingClientRect().top, headerBottom: header?.getBoundingClientRect().bottom }
    })()`)
    assert.equal(landingBrand.href, '/#hero', 'landing brand must target the Hero')
    assert.equal(landingBrand.hash, '#hero', 'direct /#hero navigation must retain the Hero hash')
    assert.ok(landingBrand.heroTop >= landingBrand.headerBottom - 1, 'the Hero must remain below the sticky header')

    await page.send('Page.navigate', { url: `${baseUrl}/workspace` })
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await evaluate(page, 'document.readyState') === 'complete') break
      await wait(50)
    }
    assert.equal(await evaluate(page, "document.querySelector('.brand-mini')?.getAttribute('href')"), '/#hero', 'workspace brand must return to the Hero')
  } finally {
    page?.close()
    await Promise.allSettled([stopProcess(server), stopProcess(browser)])
    await rm(browserDataDir, { recursive: true, force: true })
  }
})
