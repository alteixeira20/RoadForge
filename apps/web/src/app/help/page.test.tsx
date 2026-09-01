import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HelpPage from '@/app/help/page'

describe('HelpPage', () => {
  it('covers the current local-first and service-backed guide', () => {
    const html = renderToStaticMarkup(<HelpPage />)

    for (const heading of [
      'Start a roadmap',
      'Create phases and tasks',
      'Import and export',
      'Back a roadmap with the RoadForge service',
      'Team sharing',
      'Resolve save and conflict states',
      'Troubleshoot safely',
      'Known limitations',
    ]) {
      expect(html).toContain(heading)
    }

    expect(html).toContain('Local roadmaps are stored in browser local storage')
    expect(html).toContain('Save to service')
    expect(html).toContain('direct API access')
    expect(html).toContain('RoadForge MCP integration')
    expect(html).toContain('in progress — available soon')
    expect(html).toContain('Owner, editor, and viewer links are access credentials')
    expect(html).toContain('not public publishing links')
    expect(html).toContain('edit-lock networking')
    expect(html).toContain('task claim controls')
  })

  it('uses a safe static problem-report link with a complete privacy warning', () => {
    const html = renderToStaticMarkup(<HelpPage />)

    expect(html).toContain(
      'href="https://github.com/alteixeira20/RoadForge/issues/new/choose"',
    )
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('invite links')
    expect(html).toContain('tokens or session credentials')
    expect(html).toContain('private roadmap exports')
    expect(html).toContain('secrets')
    expect(html).toContain('private logs')
  })
})
