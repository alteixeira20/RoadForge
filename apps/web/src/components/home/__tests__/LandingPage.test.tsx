// @vitest-environment jsdom
import React, { act } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeaturesSection } from '../FeaturesSection'
import { HeroSection } from '../HeroSection'
import { Homepage } from '../Homepage'
import { SiteHeader } from '../../layout/SiteHeader'

vi.mock('@/components/roadmap/RoadmapSwitcher', () => ({
  RoadmapSwitcher: () => null,
}))
vi.mock('../HowItWorksSection', () => ({ HowItWorksSection: () => <section id="how" /> }))
vi.mock('../ClosingCTA', () => ({ ClosingCTA: () => <section id="closing" /> }))
vi.mock('@/components/layout/SiteFooter', () => ({ SiteFooter: () => <footer /> }))
vi.mock('@/components/ui/EmberBackground', () => ({ EmberBackground: () => null }))

let container: HTMLDivElement
let root: Root
let intersectionCallback: IntersectionObserverCallback | undefined

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  intersectionCallback = undefined
  vi.stubGlobal('IntersectionObserver', vi.fn((callback: IntersectionObserverCallback) => {
    intersectionCallback = callback
    return { disconnect: vi.fn(), observe: vi.fn(), takeRecords: vi.fn(), unobserve: vi.fn() }
  }))
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('landing page refinement', () => {
  it('starts the Hero with its heading and renders one metadata row after the preview', () => {
    act(() => {
      root.render(<HeroSection onCreate={vi.fn()} />)
    })

    const hero = container.querySelector('.hero')
    const preview = hero?.querySelector('.preview-wrap')
    const metadata = hero?.querySelectorAll('.meta-row')

    expect(hero?.firstElementChild?.tagName).toBe('H1')
    expect(container.textContent).not.toContain('RoadForge by Anvilary · Public Alpha')
    expect(metadata).toHaveLength(1)
    if (!preview || !metadata) throw new Error('Hero preview and metadata row should render')
    expect(metadata[0].textContent).toContain('No account required')
    expect(metadata[0].textContent).toContain('Runs locally')
    expect(metadata[0].textContent).toContain('Portable exports')
    expect(metadata[0].textContent).toContain('Non-commercial source available')
    expect(preview.compareDocumentPosition(metadata[0])).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('keeps six feature cards with icon-and-heading rows', () => {
    act(() => {
      root.render(<FeaturesSection />)
    })

    const cards = container.querySelectorAll('.feature')
    expect(cards).toHaveLength(6)
    cards.forEach((card) => {
      const heading = card.querySelector('.feature-head')
      expect(heading?.querySelector('.ic')).not.toBeNull()
      expect(heading?.querySelector('h3')).not.toBeNull()
      expect(card.querySelector(':scope > p')).not.toBeNull()
    })
  })

  it('does not render the removed workspace-proof section', () => {
    act(() => {
      root.render(<Homepage onCreate={vi.fn()} />)
    })

    expect(container.textContent).not.toContain('One file. Phases, tasks, and what to build next.')
    expect(container.querySelector('#proof')).toBeNull()
  })

  it('uses the native Features hash link and marks it active while the section is visible', () => {
    const features = document.createElement('section')
    features.id = 'features'
    features.scrollIntoView = vi.fn()
    document.body.appendChild(features)
    window.history.replaceState({}, '', '/#features')

    act(() => {
      root.render(<SiteHeader onCreate={vi.fn()} />)
    })

    const link = container.querySelector('nav a')
    expect(link?.getAttribute('href')).toBe('#features')
    expect(link?.textContent).toBe('Features')
    expect(container.textContent).not.toContain('How it works')
    expect(link?.classList.contains('active')).toBe(true)
    expect(features.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })

    act(() => {
      intersectionCallback?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver)
    })
    expect(link?.classList.contains('active')).toBe(false)

    act(() => {
      intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    })
    expect(link?.classList.contains('active')).toBe(true)
    features.remove()
  })

  it('keeps landing sections in normal flow with responsive grids, bottom spacing, and sticky-header offset rules', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/site.css'), 'utf8')
    const baseCss = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8')

    expect(css).toMatch(/\.section\.features-section\s*\{[^}]*min-height:\s*0[^}]*}/)
    expect(css).not.toMatch(/\.features-section\s*\{[^}]*overflow:\s*hidden/)
    expect(css).toContain('grid-template-columns: repeat(2, 1fr)')
    expect(css).toContain('grid-template-columns: 1fr')
    expect(css).toContain('.feature-head')
    expect(css).toContain('--landing-section-bottom: clamp(48px, 7vh, 88px)')
    expect(css).toContain('padding: 64px 0 var(--landing-section-bottom)')
    expect(css).toContain('padding: 72px 0 var(--landing-section-bottom)')
    expect(css).not.toContain('.hero .eyebrow')
    expect(baseCss).toContain('section[id] { scroll-margin-top: var(--header-h); }')
  })
})
