// @vitest-environment jsdom

import { act } from 'react'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppHeader } from '@/components/layout/AppHeader'
import {
  PROBLEM_REPORT_PRIVACY_WARNING,
  ROADFORGE_ISSUE_CHOOSER_URL,
} from '@/components/ui/ProblemReportLink'

// The switcher needs the app router; the header contract under test does not.
vi.mock('@/components/roadmap/RoadmapSwitcher', () => ({
  RoadmapSwitcher: () => <div data-testid="roadmap-switcher" />,
}))

function renderHeader(container: HTMLElement) {
  const root = createRoot(container)
  act(() => {
    root.render(
      <AppHeader
        roadmapName="A deliberately long roadmap name that must truncate"
        syncStatus="local"
        onIO={vi.fn()}
        onSave={vi.fn()}
      />,
    )
  })
  return root
}

describe('workspace header actions', () => {
  let container: HTMLElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = renderHeader(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('does not render a Help action in the workspace header', () => {
    expect(container.querySelector('a[href="/help"]')).toBeNull()
    expect(container.querySelector('.header-help-link')).toBeNull()
    expect(container.textContent).not.toContain('Help')
  })

  it('keeps the /help route and its content available', () => {
    const page = resolve(process.cwd(), 'src/app/help/page.tsx')
    expect(existsSync(page)).toBe(true)
    // Still reachable from the site header, so removing the workspace action
    // does not orphan the route.
    const siteHeader = readFileSync(
      resolve(process.cwd(), 'src/components/layout/SiteHeader.tsx'),
      'utf8',
    )
    expect(siteHeader).toContain('href="/help"')
  })

  it('keeps the exact static issue-chooser URL and safe link attributes', () => {
    const report = container.querySelector<HTMLAnchorElement>(
      '.header-report-link',
    )
    expect(report).not.toBeNull()
    expect(report?.getAttribute('href')).toBe(ROADFORGE_ISSUE_CHOOSER_URL)
    expect(report?.getAttribute('href')).toBe(
      'https://github.com/alteixeira20/RoadForge/issues/new/choose',
    )
    expect(report?.getAttribute('target')).toBe('_blank')
    expect(report?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('keeps the full accessible name, tooltip, and privacy warning', () => {
    const report = container.querySelector('.header-report-link')
    const label = report?.getAttribute('aria-label') ?? ''
    const title = report?.getAttribute('title') ?? ''

    expect(label).toContain('Report a problem with RoadForge on GitHub')
    expect(label).toContain('opens in a new tab')
    expect(label).toContain(PROBLEM_REPORT_PRIVACY_WARNING)
    expect(title).toContain('Report a problem')
    expect(title).toContain(PROBLEM_REPORT_PRIVACY_WARNING)
  })

  it('keeps the label text in the markup so wide layouts can show it', () => {
    // Visibility is a media-query concern proven in the browser suite; the
    // component must still ship the text for wide headers to render.
    const label = container.querySelector('.problem-report-link-label')
    expect(label?.textContent).toBe('Report a problem')
  })
})

describe('workspace header stylesheet contract', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/styles/workspace/header.css'),
    'utf8',
  )

  it('prevents the report action from wrapping or shrinking', () => {
    const base = css.slice(
      css.indexOf('.app-header .header-report-link {'),
      css.indexOf('.app-header .header-report-link::after'),
    )
    expect(base).toContain('white-space: nowrap')
    expect(base).toContain('flex: 0 0 auto')
  })

  it('collapses the report label above mobile widths', () => {
    const narrow = css.slice(
      css.indexOf('@media (max-width: 1024px)'),
      css.indexOf('@media (max-width: 760px)'),
    )
    expect(narrow).toContain('.problem-report-link-label { display: none; }')
    expect(narrow).toContain('display: inline')
  })

  it('keeps header actions rigid and the roadmap name truncatable', () => {
    const actions = css.slice(
      css.indexOf('.header-end > .btn,'),
      css.indexOf('.app-header .header-report-link {'),
    )
    expect(actions).toContain('.header-end > .iconbtn')
    expect(actions).toContain('.header-end > a')
    expect(actions).toContain('flex: 0 0 auto')
    // The switcher is the one control allowed to absorb the shortfall,
    // otherwise a rigid header row overflows the viewport instead of wrapping.
    expect(actions).toContain('.header-end > .roadmap-switcher')
    expect(actions).toContain('flex: 0 1 auto')

    const name = css.slice(
      css.indexOf('.header-roadmap-name {'),
      css.indexOf('/* ─── End zone'),
    )
    expect(name).toContain('text-overflow: ellipsis')
    expect(name).toContain('overflow: hidden')
    expect(name).toContain('white-space: nowrap')
  })
})
