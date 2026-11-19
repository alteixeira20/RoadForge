import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const mediaDir = path.join(projectRoot, 'docs', 'media')
const tempVideoDir = path.join(projectRoot, 'docs', 'media', '.tmp-video')

const PORT = process.env.PORT || '3000'
const BASE_URL = `http://127.0.0.1:${PORT}`

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

async function ensureServerRunning() {
  const ready = await checkServerReady(BASE_URL)
  if (ready) {
    console.log(`Server is already running at ${BASE_URL}`)
    return null
  }

  console.log(`Starting standalone production server on port ${PORT}...`)
  const serverProcess = spawn(
    process.execPath,
    [path.join(projectRoot, 'apps/frontend/scripts/serve-standalone.mjs')],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        PORT,
        HOSTNAME: '127.0.0.1',
      },
      stdio: 'pipe',
    },
  )

  serverProcess.stderr.on('data', (d) => process.stderr.write(d))

  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    await sleep(400)
    if (await checkServerReady(BASE_URL)) {
      console.log(`Server successfully started at ${BASE_URL}`)
      return serverProcess
    }
  }

  serverProcess.kill('SIGTERM')
  throw new Error(`Timed out waiting for server to start at ${BASE_URL}`)
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
  const pt = await smoothMoveToLocator(page, locator, 16)
  if (!pt) {
    await locator.click()
  } else {
    await sleep(120)
    await page.mouse.down()
    await sleep(80)
    await page.mouse.up()
  }
  await sleep(waitAfter)
}

async function smoothType(page, locator, text, delay = 40) {
  await locator.scrollIntoViewIfNeeded()
  await smoothClick(page, locator, 150)
  for (const char of text) {
    await page.keyboard.type(char)
    await sleep(delay)
  }
  await sleep(250)
}

async function ensurePhaseOpen(page, phaseLocator) {
  await phaseLocator.scrollIntoViewIfNeeded()
  const isExpanded = await phaseLocator.evaluate((el) => el.classList.contains('expanded'))
  if (!isExpanded) {
    const toggleBtn = phaseLocator.locator('.phase-toggle-btn')
    await smoothClick(page, toggleBtn, 400)
  }
}

async function toggleTask(page, taskRowLocator) {
  await taskRowLocator.scrollIntoViewIfNeeded()
  const toggleBtn = taskRowLocator.locator('.toggle-btn')
  await smoothClick(page, toggleBtn, 500)
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

async function main() {
  if (!existsSync(mediaDir)) {
    mkdirSync(mediaDir, { recursive: true })
  }
  if (!existsSync(tempVideoDir)) {
    mkdirSync(tempVideoDir, { recursive: true })
  }

  let serverProcess = null
  try {
    serverProcess = await ensureServerRunning()
  } catch (err) {
    console.error('Failed to prepare server:', err)
    process.exit(1)
  }

  console.log('Launching browser to record demonstration...')
  const browser = await chromium.launch({
    headless: true,
  })

  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    recordVideo: {
      dir: tempVideoDir,
      size: { width: 1600, height: 900 },
    },
    acceptDownloads: true,
  })

  const page = await context.newPage()

  // Inject visible custom mouse cursor for video clarity
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const cursor = document.createElement('div')
      cursor.id = 'demo-mouse-cursor'
      cursor.style.position = 'fixed'
      cursor.style.top = '0px'
      cursor.style.left = '0px'
      cursor.style.width = '20px'
      cursor.style.height = '20px'
      cursor.style.borderRadius = '50%'
      cursor.style.backgroundColor = 'rgba(234, 88, 12, 0.75)'
      cursor.style.border = '2px solid rgba(255, 255, 255, 0.95)'
      cursor.style.boxShadow = '0 0 10px rgba(234, 88, 12, 0.6)'
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

  // Set up download listeners
  page.on('download', async (download) => {
    const filename = download.suggestedFilename()
    console.log(`Observed download: ${filename}`)
  })

  console.log('--- SCENE 1: Landing Page Walkthrough ---')
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
  await sleep(1500)

  // Move across header
  await smoothMoveTo(page, 200, 48, 20)
  await sleep(600)
  await smoothMoveTo(page, 800, 48, 20)
  await sleep(600)

  // Smooth scroll down to highlight features and parent footer
  for (let y = 0; y <= 600; y += 40) {
    await page.evaluate((top) => window.scrollTo({ top }), y)
    await sleep(35)
  }
  await sleep(1200)

  // Scroll back to top
  for (let y = 600; y >= 0; y -= 40) {
    await page.evaluate((top) => window.scrollTo({ top }), y)
    await sleep(25)
  }
  await sleep(800)

  console.log('--- SCENE 2: Create Roadmap Wizard ---')
  const createHeroBtn = page.getByRole('button', { name: 'Create roadmap' }).first()
  await smoothClick(page, createHeroBtn, 800)

  const wizard = page.getByRole('dialog', { name: 'Create your roadmap' })
  await wizard.waitFor({ state: 'visible' })
  await sleep(600)

  const displayNameInput = wizard.getByLabel('Your display name', { exact: true })
  await smoothType(page, displayNameInput, 'Developer', 40)
  await sleep(300)

  const roadmapTitleInput = wizard.getByLabel('Roadmap title', { exact: true })
  await smoothType(page, roadmapTitleInput, 'Launching a Developer Tool', 40)
  await sleep(500)

  const continueButton = wizard.getByRole('button', { name: /Continue/ })
  await smoothClick(page, continueButton, 800)

  // Step 2: Choose blank
  const startingPointStep = page.getByRole('dialog', { name: 'Start simple' })
  await startingPointStep.waitFor({ state: 'visible' })
  await sleep(500)

  const createRoadmapSubmit = startingPointStep.getByRole('button', { name: 'Create roadmap', exact: true })
  await smoothClick(page, createRoadmapSubmit, 1500)

  await page.waitForURL(/\/workspace\?roadmap=/, { timeout: 15000 })
  await sleep(1200)

  console.log('--- SCENE 3: Creating 4 Project Phases ---')
  // Phase 1 is created as "Planning". Add Development, Testing, Release.
  const addPhaseBtn = page.getByRole('button', { name: 'Add another phase', exact: true })

  const phaseNames = ['Development', 'Testing', 'Release']
  for (const name of phaseNames) {
    await smoothClick(page, addPhaseBtn, 400)
    const phaseInput = page.locator('.phase-name-input')
    await phaseInput.waitFor({ state: 'visible' })
    await smoothType(page, phaseInput, name, 35)
    await page.keyboard.press('Enter')
    await sleep(600)
  }
  await sleep(1000)

  // Ensure all phases are expanded
  const expandAllBtn = page.getByRole('button', { name: /Expand all/ })
  if (await expandAllBtn.isVisible()) {
    await smoothClick(page, expandAllBtn, 600)
  }

  console.log('--- SCENE 4: Adding Tasks across All Phases ---')
  const phases = page.locator('.phase')

  // Helper to add tasks to a given phase index
  async function addTasksToPhase(phaseIndex, tasks) {
    const targetPhase = phases.nth(phaseIndex)
    await ensurePhaseOpen(page, targetPhase)
    for (let i = 0; i < tasks.length; i++) {
      const taskTitle = tasks[i]
      if (i === 0) {
        const addFirstBtn = targetPhase.getByRole('button', { name: /Add first task/ })
        if (await addFirstBtn.isVisible()) {
          await smoothClick(page, addFirstBtn, 350)
        } else {
          await smoothClick(page, targetPhase.locator('.add-task-btn'), 350)
        }
      } else {
        await smoothClick(page, targetPhase.locator('.add-task-btn'), 350)
      }
      const draftInput = targetPhase.locator('.draft-task-input')
      await draftInput.waitFor({ state: 'visible' })
      await smoothType(page, draftInput, taskTitle, 30)
      await page.keyboard.press('Enter')
      await sleep(500)
    }
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
  await sleep(1000)

  console.log('--- SCENE 5: Adding Subtasks and Completing Items ---')
  const planningPhase = phases.nth(0)
  await ensurePhaseOpen(page, planningPhase)

  // Expand "Define product requirements"
  const taskReqsHeader = planningPhase.locator('.task-row', { hasText: 'Define product requirements' }).first()
  await toggleTask(page, taskReqsHeader)

  // Add subtasks
  const addSubtaskBtn = page.getByRole('button', { name: 'Add subtask' })
  await addSubtaskBtn.waitFor({ state: 'visible' })
  const subtasksList = [
    'Identify target developer personas',
    'Document core CLI and web features',
    'Establish release acceptance criteria',
  ]

  for (const st of subtasksList) {
    await smoothClick(page, addSubtaskBtn, 300)
    const subtaskTitleInput = page.getByLabel('Subtask title')
    await smoothType(page, subtaskTitleInput, st, 30)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await sleep(500)
  }
  await sleep(800)

  // Check off first subtask
  const personaCheck = page.getByRole('checkbox', {
    name: 'Mark subtask "Identify target developer personas" as complete',
  })
  await smoothClick(page, personaCheck, 800)

  // Collapse "Define product requirements"
  await toggleTask(page, taskReqsHeader)
  await sleep(600)

  console.log('--- SCENE 6: Task Details, Markdown, Complexity, and Tags ---')
  // Expand "Design core architecture"
  const taskArchHeader = planningPhase.locator('.task-row', { hasText: 'Design core architecture' }).first()
  await toggleTask(page, taskArchHeader)

  const editDetailsBtn = page.getByRole('button', { name: 'Edit details' })
  await editDetailsBtn.waitFor({ state: 'visible' })
  await smoothClick(page, editDetailsBtn, 600)

  // Select Complexity: High
  const complexitySelect = page.locator('select[id^="edit-complexity-"]')
  await smoothClick(page, complexitySelect, 300)
  await complexitySelect.selectOption('high')
  await sleep(400)

  // Fill Markdown description
  const descTextarea = page.locator('textarea[id^="edit-desc-"]')
  await smoothType(
    page,
    descTextarea,
    '### Architecture Principles\n- Local-first browser persistence\n- Portable JSON and Markdown schemas\n- Realtime SSE synchronization\n',
    25,
  )
  await sleep(400)

  // Add Tag: Core
  const tagInput = page.locator('.tag-chip-input')
  if (await tagInput.isVisible()) {
    await smoothType(page, tagInput, 'Core', 30)
    await page.keyboard.press('Enter')
    await sleep(400)
  }

  // Save changes
  const saveBtn = page.getByRole('button', { name: 'Save', exact: true })
  await smoothClick(page, saveBtn, 800)

  // Collapse "Design core architecture"
  await toggleTask(page, taskArchHeader)
  await sleep(600)

  console.log('--- SCENE 7: Dependencies and Blocked Indicator ---')
  const releasePhase = phases.nth(3)
  await ensurePhaseOpen(page, releasePhase)

  // Expand "Publish initial release candidate"
  const taskPublishHeader = releasePhase.locator('.task-row', { hasText: 'Publish initial release candidate' }).first()
  await toggleTask(page, taskPublishHeader)

  const linkDepBtn = page.getByRole('button', { name: 'Link dependency' })
  await linkDepBtn.waitFor({ state: 'visible' })
  await smoothClick(page, linkDepBtn, 500)

  // Search and select Playwright test task
  const depSearchInput = page.getByLabel('Search tasks to link')
  await smoothType(page, depSearchInput, 'Playwright', 30)
  await sleep(400)

  const depOption = page.locator('.task-option', { hasText: 'Run Playwright end-to-end browser tests' }).first()
  await smoothClick(page, depOption, 800)

  // Collapse "Publish initial release candidate"
  await toggleTask(page, taskPublishHeader)
  await sleep(800)

  console.log('--- SCENE 8: Search and Filtering ---')
  const searchInput = page.getByRole('textbox', { name: 'Search roadmap tasks' })
  await smoothType(page, searchInput, 'Playwright', 35)
  await sleep(1500)
  // Clear search
  await searchInput.fill('')
  await sleep(800)

  console.log('--- SCENE 9: Tracking Progress across Roadmap ---')
  // In Phase 3 (Testing), check off unit tests and Playwright tests
  const unitTestCheck = page.getByRole('checkbox', {
    name: 'Mark task "Write automated unit test suites" as complete',
  })
  await smoothClick(page, unitTestCheck, 600)

  const e2eCheck = page.getByRole('checkbox', {
    name: 'Mark task "Run Playwright end-to-end browser tests" as complete',
  })
  await smoothClick(page, e2eCheck, 600)

  // In Phase 1 (Planning), check off "Research competing developer tools"
  const researchCheck = page.getByRole('checkbox', {
    name: 'Mark task "Research competing developer tools" as complete',
  })
  await smoothClick(page, researchCheck, 800)

  console.log('--- SCENE 10: Local-First Persistence & Recovery ---')
  // Reload page to demonstrate recovery
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(1500)

  console.log('--- SCENE 11: Exporting Portable Backups ---')
  const ioBtn = page.getByRole('button', { name: 'Import / Export' })
  await smoothClick(page, ioBtn, 800)

  const exportTab = page.getByRole('tab', { name: 'Export' })
  if (await exportTab.isVisible()) {
    await smoothClick(page, exportTab, 400)
  }

  const downloadJsonBtn = page.getByRole('button', { name: /Download \.roadforge\.json/ })
  await smoothClick(page, downloadJsonBtn, 1200)

  // Re-open modal to export readable Markdown
  await smoothClick(page, ioBtn, 800)
  if (await exportTab.isVisible()) {
    await smoothClick(page, exportTab, 400)
  }
  const downloadMdBtn = page.getByRole('button', { name: /Download readable Markdown/ })
  await smoothClick(page, downloadMdBtn, 1200)

  console.log('--- SCENE 12: Final Roadmap Showcase ---')
  // Smoothly scroll down through all 4 phases and then back up
  for (let y = 0; y <= 400; y += 30) {
    await page.evaluate((top) => window.scrollTo({ top }), y)
    await sleep(40)
  }
  await sleep(1200)

  for (let y = 400; y >= 0; y -= 30) {
    await page.evaluate((top) => window.scrollTo({ top }), y)
    await sleep(30)
  }
  await sleep(2500)

  console.log('Demonstration recording finished. Closing browser context...')
  await context.close()
  await browser.close()

  if (serverProcess) {
    console.log('Stopping server process...')
    serverProcess.kill('SIGTERM')
  }

  // Find generated video in tempVideoDir
  const videoFiles = readdirSync(tempVideoDir).filter((f) => f.endsWith('.webm'))
  if (videoFiles.length === 0) {
    throw new Error('No video recorded in tempVideoDir')
  }
  const rawVideoPath = path.join(tempVideoDir, videoFiles[0])
  console.log(`Recorded raw video at: ${rawVideoPath}`)

  const targetMp4Path = path.join(mediaDir, 'roadforge-product-demo.mp4')
  const targetThumbnailPath = path.join(mediaDir, 'roadforge-demo-thumbnail.png')
  const targetGifPath = path.join(mediaDir, 'roadforge-demo-preview.gif')

  console.log(`Transcoding to final MP4: ${targetMp4Path}`)
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
    '22',
    targetMp4Path,
  ])

  console.log(`Extracting representative thumbnail: ${targetThumbnailPath}`)
  // Extract a clean frame from ~5 seconds before the end
  await runFfmpeg([
    '-y',
    '-sseof',
    '-4',
    '-i',
    targetMp4Path,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    targetThumbnailPath,
  ])

  console.log(`Generating high-quality looping preview GIF: ${targetGifPath}`)
  // Extract a 10s highlight section showing task creation and subtask interactions
  // Scale to 800 width, 12 fps, palettegen/paletteuse to keep well under 5MB
  await runFfmpeg([
    '-y',
    '-ss',
    '00:00:45',
    '-t',
    '10',
    '-i',
    targetMp4Path,
    '-vf',
    'fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer',
    targetGifPath,
  ])

  // Check gif file size
  const gifStat = statSync(targetGifPath)
  const mp4Stat = statSync(targetMp4Path)
  console.log(`MP4 size: ${(mp4Stat.size / (1024 * 1024)).toFixed(2)} MB`)
  console.log(`GIF size: ${(gifStat.size / (1024 * 1024)).toFixed(2)} MB`)

  if (gifStat.size > 5 * 1024 * 1024) {
    console.warn('GIF size is over 5MB, re-optimizing at 10 fps and 720 width...')
    await runFfmpeg([
      '-y',
      '-ss',
      '00:00:45',
      '-t',
      '9',
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
