// @vitest-environment jsdom

import { act } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { SiteFooter } from '@/components/layout/SiteFooter'

describe('current product copy', () => {
  it('keeps the footer release-neutral and license-accurate', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => root.render(<SiteFooter />))

    expect(container.textContent).toContain('Pre-release · An Anvilary product')
    expect(container.textContent).toContain('Non-commercial source available')
    expect(container.textContent).not.toMatch(/\balpha\b/i)
    expect(container.textContent).not.toMatch(/\bWIP\b|work in progress/i)
    act(() => root.unmount())
  })

  it('keeps metadata and workspace document titles release-neutral', () => {
    const layout = readFileSync(
      resolve(process.cwd(), 'src/app/layout.tsx'),
      'utf8',
    )
    const workspace = readFileSync(
      resolve(process.cwd(), 'src/components/roadmap/Workspace.tsx'),
      'utf8',
    )

    expect(layout).toContain("title: 'RoadForge'")
    expect(layout).not.toMatch(/\balpha\b|work in progress|\bWIP\b/i)
    expect(workspace).toContain('`${title} · RoadForge`')
    expect(workspace).not.toMatch(/\balpha\b|work in progress|\bWIP\b/i)
  })
})
