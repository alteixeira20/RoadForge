import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HelpPage from '@/app/help/page'

describe('HelpPage', () => {
  it('covers the task-based user guide', () => {
    const html = renderToStaticMarkup(<HelpPage />)

    for (const heading of [
      'Start a roadmap',
      'Create phases and tasks',
      'Import and export',
      'Save and share',
      'Resolve save and conflict states',
      'Use activity and versions',
      'Troubleshoot safely',
      'Known limitations',
    ]) {
      expect(html).toContain(heading)
    }
    expect(html).toContain('Local roadmaps are stored in browser local storage')
    expect(html).toContain('Owner:')
    expect(html).toContain('Editor:')
    expect(html).toContain('Viewer:')
    expect(html).toContain('edit lock')
    expect(html).toContain('task claim')
  })

  it('uses a safe static problem-report link with a privacy warning', () => {
    const html = renderToStaticMarkup(<HelpPage />)

    expect(html).toContain(
      'href="https://github.com/alteixeira20/RoadForge/issues/new/choose"',
    )
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('Do not include invite links, tokens, private roadmap exports')
  })
})
