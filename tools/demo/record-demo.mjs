import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const mediaDir = path.join(projectRoot, 'docs', 'media')
const tempVideoDir = path.join(projectRoot, 'docs', 'media', '.tmp-video')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function availablePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  return port
}

function checkServerReady(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 304)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function startServer(port) {
  const url = `http://127.0.0.1:${port}`
  console.log(`Starting standalone production server on port ${port}...`)
  const serverProcess = spawn(
    process.execPath,
    [path.join(projectRoot, 'apps/frontend/scripts/serve-standalone.mjs')],
    {
      cwd: path.join(projectRoot, 'apps/frontend'),
      env: {
        ...process.env,
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
      },
      stdio: 'pipe',
    },
  )

  serverProcess.stderr.on('data', (d) => process.stderr.write(d))

  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    await sleep(350)
    if (await checkServerReady(url)) {
      console.log(`Server successfully started at ${url}`)
      return { serverProcess, url }
    }
  }

  serverProcess.kill('SIGTERM')
  throw new Error(`Timed out waiting for server at ${url}`)
}

async function smoothMoveTo(page, targetX, targetY, steps = 18) {
  await page.mouse.move(targetX, targetY, { steps })
}

async function smoothMoveToLocator(page, locator, steps = 18) {
  const box = await locator.boundingBox()
  if (!box) return null
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await smoothMoveTo(page, cx, cy, steps)
  return { cx, cy, box }
}

async function smoothClick(page, locator, waitAfter = 500) {
  await locator.scrollIntoViewIfNeeded()
  let box = await locator.boundingBox()
  if (box && box.y < 125) {
    await page.evaluate((delta) => window.scrollBy({ top: delta, behavior: 'instant' }), box.y - 145)
    await sleep(100)
    box = await locator.boundingBox()
  }
  if (!box) {
    await locator.click()
  } else {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await smoothMoveTo(page, cx, cy, 14)
    await sleep(80)
    await page.mouse.down()
    await sleep(70)
    await page.mouse.up()
  }
  await sleep(waitAfter)
}

async function smoothType(page, locator, text, delay = 35) {
  await smoothClick(page, locator, 120)
  for (const char of text) {
    await page.keyboard.type(char)
    await sleep(delay)
  }
  await sleep(250)
}

async function ensurePhaseOpen(page, phaseLocator) {
  await phaseLocator.scrollIntoViewIfNeeded()
  let box = await phaseLocator.boundingBox()
  if (box && box.y < 125) {
    await page.evaluate((delta) => window.scrollBy({ top: delta, behavior: 'instant' }), box.y - 145)
    await sleep(100)
  }
  const isExpanded = await phaseLocator.evaluate((el) => el.classList.contains('expanded'))
  if (!isExpanded) {
    const toggleBtn = phaseLocator.locator('.phase-toggle-btn')
    if (await toggleBtn.isVisible()) {
      await smoothClick(page, toggleBtn, 400)
    }
  }
}

async function toggleTask(page, taskRowLocator, shouldExpand = null) {
  await taskRowLocator.scrollIntoViewIfNeeded()
  let box = await taskRowLocator.boundingBox()
  if (box && box.y < 125) {
    await page.evaluate((delta) => window.scrollBy({ top: delta, behavior: 'instant' }), box.y - 145)
    await sleep(100)
  }
  const toggleBtn = taskRowLocator.locator('.toggle-btn')
  const isExpanded = (await toggleBtn.getAttribute('aria-expanded')) === 'true'
  const target = shouldExpand !== null ? shouldExpand : !isExpanded
  if (isExpanded !== target) {
    await smoothClick(page, toggleBtn, 450)
    const isNowExpanded = (await toggleBtn.getAttribute('aria-expanded')) === 'true'
    if (isNowExpanded !== target) {
      await toggleBtn.click()
      await sleep(300)
    }
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    console.log(`Running ffmpeg ${args.join(' ')}`)
    const child = spawn('ffmpeg', args, { stdio: 'inherit' })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}`))
    })
  })
}

function getVideoDuration(filePath) {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ])
    let out = ''
    proc.stdout.on('data', (d) => { out += d.toString() })
    proc.on('close', () => resolve(parseFloat(out.trim()) || 60))
  })
}

async function main() {
  if (existsSync(tempVideoDir)) rmSync(tempVideoDir, { recursive: true, force: true })
  mkdirSync(tempVideoDir, { recursive: true })
  if (!existsSync(mediaDir)) mkdirSync(mediaDir, { recursive: true })

  const port = await availablePort()
  const { serverProcess, url: BASE_URL } = await startServer(port)

  console.log('Launching browser to record demonstration (1920x1080)...')
  const browser = await chromium.launch({
    headless: true,
  })

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: tempVideoDir,
      size: { width: 1920, height: 1080 },
    },
    acceptDownloads: true,
  })

  const page = await context.newPage()

  // Inject visible custom mouse cursor overlay
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const cursor = document.createElement('div')
      cursor.id = 'demo-mouse-cursor'
      cursor.style.position = 'fixed'
      cursor.style.top = '0px'
      cursor.style.left = '0px'
      cursor.style.width = '22px'
      cursor.style.height = '22px'
      cursor.style.borderRadius = '50%'
      cursor.style.backgroundColor = 'rgba(234, 88, 12, 0.75)'
      cursor.style.border = '2px solid rgba(255, 255, 255, 0.95)'
      cursor.style.boxShadow = '0 0 12px rgba(234, 88, 12, 0.6)'
      cursor.style.pointerEvents = 'none'
      cursor.style.zIndex = '999999'
      cursor.style.transition = 'transform 0.08s ease-out, background-color 0.15s ease'
      cursor.style.transform = 'translate(-50%, -50%)'
      cursor.style.display = 'none'
      document.body.appendChild(cursor)

      window.addEventListener('mousemove', (e) => {
        cursor.style.display = 'block'
        cursor.style.left = `${e.clientX}px`
        cursor.style.top = `${e.clientY}px`
      })
      window.addEventListener('mousedown', () => {
        cursor.style.transform = 'translate(-50%, -50%) scale(0.7)'
        cursor.style.backgroundColor = 'rgba(234, 88, 12, 1)'
      })
      window.addEventListener('mouseup', () => {
        cursor.style.transform = 'translate(-50%, -50%) scale(1)'
        cursor.style.backgroundColor = 'rgba(234, 88, 12, 0.75)'
      })
    })
  })

  // Download listeners
  page.on('download', async (download) => {
    const filename = download.suggestedFilename()
    console.log(`Observed download: ${filename}`)
  })

  console.log('--- SCENE 1: Create a Roadmap ---')
  // Begin immediately with roadmap creation from landing page
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
  await sleep(1500)

  // Smoothly move to CTA button and click
  const tryDemoBtn = page.locator('.hero .btn.primary, button:has-text("Hosted demo"), button:has-text("Create roadmap")').first()
  await smoothClick(page, tryDemoBtn, 900)

  const wizard = page.getByRole('dialog', { name: 'Create your roadmap' })
  await wizard.waitFor({ state: 'visible' })
  await sleep(800)

  const displayNameInput = wizard.getByLabel('Your display name', { exact: true })
  await smoothType(page, displayNameInput, 'Developer', 55)
  await sleep(700)

  const roadmapTitleInput = wizard.getByLabel('Roadmap title', { exact: true })
  await smoothType(page, roadmapTitleInput, 'Launching a Developer Tool', 50)
  await sleep(900)

  const continueBtn = wizard.getByRole('button', { name: /Continue/ })
  await smoothClick(page, continueBtn, 1000)

  const startingPointStep = page.getByRole('dialog', { name: 'Start simple' })
  await startingPointStep.waitFor({ state: 'visible' })
  await sleep(1000)

  const createRoadmapSubmit = startingPointStep.getByRole('button', { name: 'Create roadmap', exact: true })
  await smoothClick(page, createRoadmapSubmit, 2000)

  await page.waitForURL(/\/workspace\?roadmap=/, { timeout: 15000 })
  await sleep(1800)

  console.log('--- SCENE 2: Create Phases ---')
  // Starts with initial "Planning" phase. Add Development, Testing, Release.
  const addPhaseBtn = page.getByRole('button', { name: 'Add another phase', exact: true })

  const phaseNames = ['Development', 'Testing', 'Release']
  for (const name of phaseNames) {
    await smoothClick(page, addPhaseBtn, 600)
    const phaseInput = page.locator('.phase-name-input')
    await phaseInput.waitFor({ state: 'visible' })
    await smoothType(page, phaseInput, name, 50)
    await page.keyboard.press('Enter')
    await sleep(1200)
  }
  await sleep(1200)

  // Expand all phases for clear overview
  const expandAllBtn = page.getByRole('button', { name: /Expand all/ })
  if (await expandAllBtn.isVisible()) {
    await smoothClick(page, expandAllBtn, 1000)
  }
  await sleep(1000)

  console.log('--- SCENE 3: Add Tasks across All Phases ---')
  const phases = page.locator('.phase')

  async function addTasksToPhase(phaseIndex, tasks) {
    const targetPhase = phases.nth(phaseIndex)
    await ensurePhaseOpen(page, targetPhase)
    for (let i = 0; i < tasks.length; i++) {
      const taskTitle = tasks[i]
      if (i === 0) {
        const addFirstBtn = targetPhase.getByRole('button', { name: /Add first task/ })
        if (await addFirstBtn.isVisible()) {
          await smoothClick(page, addFirstBtn, 500)
        } else {
          await smoothClick(page, targetPhase.locator('.add-task-btn'), 500)
        }
      } else {
        await smoothClick(page, targetPhase.locator('.add-task-btn'), 500)
      }
      const draftInput = targetPhase.locator('.draft-task-input')
      await draftInput.waitFor({ state: 'visible' })
      await smoothType(page, draftInput, taskTitle, 40)
      await page.keyboard.press('Enter')
      await sleep(1000)
    }
    await sleep(800)
  }

  // 1. Planning phase tasks
  await addTasksToPhase(0, [
    'Define product requirements',
    'Research competing developer tools',
    'Design core architecture',
  ])

  // 2. Development phase tasks
  await addTasksToPhase(1, [
    'Implement workspace frontend components',
    'Build local-first persistence engine',
    'Implement REST API & authentication',
  ])

  // 3. Testing phase tasks
  await addTasksToPhase(2, [
    'Write automated unit test suites',
    'Run Playwright end-to-end browser tests',
    'Execute security and dependency audits',
  ])

  // 4. Release phase tasks
  await addTasksToPhase(3, [
    'Prepare comprehensive user documentation',
    'Build production Docker container images',
    'Publish initial release candidate',
  ])
  await sleep(1800)

  console.log('--- SCENE 4: Add Subtasks across Multiple Deliverables ---')
  // Subtasks on Planning: "Define product requirements" (3 subtasks)
  const planningPhase = phases.nth(0)
  await ensurePhaseOpen(page, planningPhase)
  const reqsHeader = planningPhase.locator('.task-row', { hasText: 'Define product requirements' }).first()
  await toggleTask(page, reqsHeader, true)

  const addSubtaskBtn = page.getByRole('button', { name: 'Add subtask' })
  await addSubtaskBtn.waitFor({ state: 'visible' })

  const reqsSubtasks = [
    'Identify target developer personas',
    'Document core CLI and web features',
    'Establish release acceptance criteria',
  ]
  for (const st of reqsSubtasks) {
    await smoothClick(page, addSubtaskBtn, 400)
    const input = page.getByLabel('Subtask title')
    await smoothType(page, input, st, 40)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await sleep(800)
  }

  // Mark first subtask complete
  const personaCheck = page.getByRole('checkbox', {
    name: 'Mark subtask "Identify target developer personas" as complete',
  })
  await smoothClick(page, personaCheck, 1200)
  await toggleTask(page, reqsHeader, false)
  await sleep(1000)

  // Subtasks on Development: "Implement workspace frontend components" (3 subtasks)
  const devPhase = phases.nth(1)
  await ensurePhaseOpen(page, devPhase)
  const frontendTaskHeader = devPhase.locator('.task-row', { hasText: 'Implement workspace frontend components' }).first()
  await toggleTask(page, frontendTaskHeader, true)
  await addSubtaskBtn.waitFor({ state: 'visible' })

  const devSubtasks = [
    'Create responsive hero layout',
    'Implement drag-and-drop phase reordering',
    'Build accessible keyboard navigation',
  ]
  for (const st of devSubtasks) {
    await smoothClick(page, addSubtaskBtn, 400)
    const input = page.getByLabel('Subtask title')
    await smoothType(page, input, st, 40)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await sleep(800)
  }

  // Mark first subtask complete
  const heroCheck = page.getByRole('checkbox', {
    name: 'Mark subtask "Create responsive hero layout" as complete',
  })
  await smoothClick(page, heroCheck, 1200)
  await toggleTask(page, frontendTaskHeader, false)
  await sleep(1000)

  // Subtasks on Testing: "Write automated unit test suites" (2 subtasks)
  const testPhase = phases.nth(2)
  await ensurePhaseOpen(page, testPhase)
  const unitTaskHeader = testPhase.locator('.task-row', { hasText: 'Write automated unit test suites' }).first()
  await toggleTask(page, unitTaskHeader, true)
  await addSubtaskBtn.waitFor({ state: 'visible' })

  const testSubtasks = [
    'Unit tests for state management',
    'Snapshot tests for export schemas',
  ]
  for (const st of testSubtasks) {
    await smoothClick(page, addSubtaskBtn, 400)
    const input = page.getByLabel('Subtask title')
    await smoothType(page, input, st, 40)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await sleep(800)
  }

  const stateCheck = page.getByRole('checkbox', {
    name: 'Mark subtask "Unit tests for state management" as complete',
  })
  await smoothClick(page, stateCheck, 1200)
  await toggleTask(page, unitTaskHeader, false)
  await sleep(1200)

  console.log('--- SCENE 5: Configure Complexity, Tags, and Markdown Notes ---')
  // 1. Task: Design core architecture -> High Complexity, Tag: Core, Rich Markdown
  await ensurePhaseOpen(page, planningPhase)
  const archTaskHeader = planningPhase.locator('.task-row', { hasText: 'Design core architecture' }).first()
  await toggleTask(page, archTaskHeader, true)

  const editDetailsBtn = page.getByRole('button', { name: 'Edit details' })
  await editDetailsBtn.waitFor({ state: 'visible' })
  await smoothClick(page, editDetailsBtn, 800)

  const complexitySelect = page.locator('select[id^="edit-complexity-"]')
  await smoothClick(page, complexitySelect, 400)
  await complexitySelect.selectOption('high')
  await sleep(600)

  const descTextarea = page.locator('textarea[id^="edit-desc-"]')
  await smoothType(
    page,
    descTextarea,
    '### Architecture Principles\n- Local-first browser persistence\n- Portable JSON and Markdown schemas\n- Realtime SSE synchronization\n',
    35,
  )
  await sleep(600)

  const tagInput = page.locator('.tag-chip-input')
  if (await tagInput.isVisible()) {
    await smoothType(page, tagInput, 'Core', 40)
    await page.keyboard.press('Enter')
    await sleep(600)
  }

  const saveBtn = page.getByRole('button', { name: 'Save', exact: true })
  await smoothClick(page, saveBtn, 1200)
  await toggleTask(page, archTaskHeader, false)
  await sleep(1000)

  // 2. Task: Build local-first persistence engine -> Tag: Engine
  await ensurePhaseOpen(page, devPhase)
  const engineTaskHeader = devPhase.locator('.task-row', { hasText: 'Build local-first persistence engine' }).first()
  await toggleTask(page, engineTaskHeader, true)
  await smoothClick(page, editDetailsBtn, 800)
  if (await tagInput.isVisible()) {
    await smoothType(page, tagInput, 'Engine', 40)
    await page.keyboard.press('Enter')
    await sleep(600)
  }
  await smoothClick(page, saveBtn, 1200)
  await toggleTask(page, engineTaskHeader, false)
  await sleep(1000)

  // 3. Task: Prepare comprehensive user documentation -> Complexity: Low, Tag: Docs
  const releasePhase = phases.nth(3)
  await ensurePhaseOpen(page, releasePhase)
  const docsTaskHeader = releasePhase.locator('.task-row', { hasText: 'Prepare comprehensive user documentation' }).first()
  await toggleTask(page, docsTaskHeader, true)
  await smoothClick(page, editDetailsBtn, 800)
  await smoothClick(page, complexitySelect, 400)
  await complexitySelect.selectOption('low')
  await sleep(600)
  if (await tagInput.isVisible()) {
    await smoothType(page, tagInput, 'Docs', 40)
    await page.keyboard.press('Enter')
    await sleep(600)
  }
  await smoothClick(page, saveBtn, 1200)
  await toggleTask(page, docsTaskHeader, false)
  await sleep(1200)

  console.log('--- SCENE 6: Create Dependencies and Demonstrate Cycle Prevention ---')
  // Link: "Publish initial release candidate" depends on "Run Playwright end-to-end browser tests"
  await ensurePhaseOpen(page, releasePhase)
  const publishTaskHeader = releasePhase.locator('.task-row', { hasText: 'Publish initial release candidate' }).first()
  await toggleTask(page, publishTaskHeader, true)

  const linkDepBtn = page.getByRole('button', { name: 'Link dependency' })
  await linkDepBtn.waitFor({ state: 'visible' })
  await smoothClick(page, linkDepBtn, 800)

  const depSearchInput = page.getByLabel('Search tasks to link')
  await smoothType(page, depSearchInput, 'Playwright', 40)
  await sleep(800)

  const depOption = page.locator('.task-option', { hasText: 'Run Playwright end-to-end browser tests' }).first()
  await smoothClick(page, depOption, 1200)
  await sleep(600)
  // Collapse and observe the amber Blocked status badge
  await toggleTask(page, publishTaskHeader, false)
  await sleep(2000)

  // Link: "Implement workspace frontend components" depends on "Design core architecture"
  await ensurePhaseOpen(page, devPhase)
  await toggleTask(page, frontendTaskHeader, true)
  await smoothClick(page, linkDepBtn, 800)
  await smoothType(page, depSearchInput, 'Design core', 40)
  await sleep(800)
  const archDepOption = page.locator('.task-option', { hasText: 'Design core architecture' }).first()
  await smoothClick(page, archDepOption, 1200)
  await toggleTask(page, frontendTaskHeader, false)
  await sleep(1500)

  // Demonstrate Cycle Prevention:
  // On "Run Playwright end-to-end browser tests", attempt to link back to "Publish initial release candidate"
  await ensurePhaseOpen(page, testPhase)
  const playwrightTaskHeader = testPhase.locator('.task-row', { hasText: 'Run Playwright end-to-end browser tests' }).first()
  await toggleTask(page, playwrightTaskHeader, true)
  await smoothClick(page, linkDepBtn, 800)
  await smoothType(page, depSearchInput, 'Publish', 40)
  await sleep(2200) // Clearly show "No available tasks to link" due to cycle prevention
  const cancelDepBtn = page.getByRole('button', { name: 'Cancel' })
  if (await cancelDepBtn.isVisible()) {
    await smoothClick(page, cancelDepBtn, 600)
  }
  await toggleTask(page, playwrightTaskHeader, false)
  await sleep(1500)

  console.log('--- SCENE 7: Organize the Roadmap (Search, Filter, Tags) ---')
  const searchInput = page.getByRole('textbox', { name: 'Search roadmap tasks' })
  await smoothType(page, searchInput, 'Playwright', 45)
  await sleep(2500)
  await searchInput.fill('')
  await sleep(1200)

  // Visit Tags panel to show organized tag registry
  const tagsTab = page.getByRole('tab', { name: 'Tags', exact: true })
  await smoothClick(page, tagsTab, 1800)
  await sleep(2000)

  // Return to Roadmap view
  const roadmapTab = page.getByRole('tab', { name: 'Roadmap', exact: true })
  await smoothClick(page, roadmapTab, 1500)
  await sleep(1000)

  console.log('--- SCENE 8: Track Progress (Completing Tasks & Clearing Blockers) ---')
  await ensurePhaseOpen(page, planningPhase)
  // Complete "Research competing developer tools"
  const researchCheck = page.getByRole('checkbox', {
    name: 'Mark task "Research competing developer tools" as complete',
  })
  await smoothClick(page, researchCheck, 1500)

  // Complete "Design core architecture"
  const archCheck = page.getByRole('checkbox', {
    name: 'Mark task "Design core architecture" as complete',
  })
  await smoothClick(page, archCheck, 1800)

  await ensurePhaseOpen(page, testPhase)
  // Complete "Write automated unit test suites"
  const unitCheck = page.getByRole('checkbox', {
    name: 'Mark task "Write automated unit test suites" as complete',
  })
  await smoothClick(page, unitCheck, 1500)

  // Complete "Run Playwright end-to-end browser tests"
  const playwrightCheck = page.getByRole('checkbox', {
    name: 'Mark task "Run Playwright end-to-end browser tests" as complete',
  })
  await smoothClick(page, playwrightCheck, 2500)
  // Notice: with Playwright tests complete, "Publish initial release candidate" is unblocked!
  await sleep(2000)

  console.log('--- SCENE 9: Persistence (Local-First Reliability) ---')
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(2800)

  console.log('--- SCENE 10: Import and Export ---')
  const ioBtn = page.getByRole('button', { name: 'Import / Export' })
  await smoothClick(page, ioBtn, 1200)

  const exportTab = page.getByRole('tab', { name: 'Export' })
  if (await exportTab.isVisible()) {
    await smoothClick(page, exportTab, 800)
  }

  const downloadJsonBtn = page.getByRole('button', { name: /Download \.roadforge\.json/ })
  await smoothClick(page, downloadJsonBtn, 2000)

  // Re-open modal to export readable Markdown
  await smoothClick(page, ioBtn, 1200)
  if (await exportTab.isVisible()) {
    await smoothClick(page, exportTab, 800)
  }
  const downloadMdBtn = page.getByRole('button', { name: /Download readable Markdown/ })
  await smoothClick(page, downloadMdBtn, 2000)

  console.log('--- SCENE 11: Final Roadmap Showcase ---')
  // Ensure all phases are expanded and beautifully visible
  if (await expandAllBtn.isVisible()) {
    await smoothClick(page, expandAllBtn, 1000)
  }
  await sleep(1500)

  // Smooth scroll down through all 4 phases and then back up
  for (let y = 0; y <= 600; y += 20) {
    await page.evaluate((top) => window.scrollTo({ top }), y)
    await sleep(50)
  }
  await sleep(2500)

  for (let y = 600; y >= 0; y -= 20) {
    await page.evaluate((top) => window.scrollTo({ top }), y)
    await sleep(40)
  }
  // Concluding beauty pause on the complete 4-phase roadmap
  await sleep(4000)

  console.log('Demonstration recording finished. Closing browser context...')
  const video = page.video()
  await page.close()
  await context.close()
  await browser.close()
  serverProcess.kill('SIGTERM')

  const rawVideoPath = await video.path()
  console.log(`Recorded raw video at: ${rawVideoPath}`)

  const targetMp4Path = path.join(mediaDir, 'roadforge-product-demo.mp4')
  const targetThumbnailPath = path.join(mediaDir, 'roadforge-demo-thumbnail.png')
  const targetGifPath = path.join(mediaDir, 'roadforge-demo-preview.gif')

  console.log(`Transcoding to final MP4 (1920x1080 30FPS H.264): ${targetMp4Path}`)
  await runFfmpeg([
    '-y',
    '-i',
    rawVideoPath,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '30',
    '-preset',
    'slow',
    '-crf',
    '21',
    targetMp4Path,
  ])

  const duration = await getVideoDuration(targetMp4Path)
  console.log(`Final MP4 duration: ${duration.toFixed(1)} seconds`)

  console.log(`Extracting representative thumbnail: ${targetThumbnailPath}`)
  const thumbOffset = Math.max(1, Math.floor(duration - 4))
  await runFfmpeg([
    '-y',
    '-ss',
    String(thumbOffset),
    '-i',
    targetMp4Path,
    '-frames:v',
    '1',
    '-update',
    '1',
    '-q:v',
    '2',
    targetThumbnailPath,
  ])

  console.log(`Generating high-quality looping preview GIF: ${targetGifPath}`)
  // Extract a 9s highlight section showing task creation and subtask interactions
  const gifStart = Math.min(Math.max(10, Math.floor(duration * 0.28)), Math.max(0, Math.floor(duration - 12)))
  await runFfmpeg([
    '-y',
    '-ss',
    String(gifStart),
    '-t',
    '9',
    '-i',
    targetMp4Path,
    '-vf',
    'fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer',
    targetGifPath,
  ])

  // Check file sizes
  const gifStat = statSync(targetGifPath)
  const mp4Stat = statSync(targetMp4Path)
  console.log(`MP4 size: ${(mp4Stat.size / (1024 * 1024)).toFixed(2)} MB`)
  console.log(`GIF size: ${(gifStat.size / (1024 * 1024)).toFixed(2)} MB`)

  if (gifStat.size > 5 * 1024 * 1024) {
    console.warn('GIF size is over 5MB, re-optimizing at 10 fps and 720 width...')
    await runFfmpeg([
      '-y',
      '-ss',
      String(gifStart),
      '-t',
      '8',
      '-i',
      targetMp4Path,
      '-vf',
      'fps=10,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer',
      targetGifPath,
    ])
    const newGifStat = statSync(targetGifPath)
    console.log(`Optimized GIF size: ${(newGifStat.size / (1024 * 1024)).toFixed(2)} MB`)
  }

  // Clean up temp video directory
  rmSync(tempVideoDir, { recursive: true, force: true })
  console.log('Cleanup completed successfully.')
}

main().catch((err) => {
  console.error('Demonstration recording script failed:', err)
  process.exit(1)
})
