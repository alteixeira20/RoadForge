// @vitest-environment jsdom
import React, { act } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeaturesSection } from '../FeaturesSection'
import { HeroSection } from '../HeroSection'
import { HowItWorksSection } from '../HowItWorksSection'
import { Homepage } from '../Homepage'
import { SiteHeader } from '../../layout/SiteHeader'

vi.mock('@/components/roadmap/RoadmapSwitcher', () => ({
  RoadmapSwitcher: () => null,
}))
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

    expect(hero?.id).toBe('hero')
    expect(hero?.firstElementChild?.classList.contains('hero-inner')).toBe(true)
    expect(hero?.querySelector('.hero-inner > h1')).not.toBeNull()
    expect(container.textContent).not.toContain('RoadForge by Anvilary · Public Alpha')
    expect(metadata).toHaveLength(1)
    if (!preview || !metadata) throw new Error('Hero preview and metadata row should render')
    expect(metadata[0].querySelectorAll('span')).toHaveLength(4)
    expect(metadata[0].textContent?.match(/No account required/g)).toHaveLength(1)
    expect(metadata[0].textContent?.match(/Runs locally/g)).toHaveLength(1)
    expect(metadata[0].textContent?.match(/Portable exports/g)).toHaveLength(1)
    expect(metadata[0].textContent?.match(/Non-commercial source available/g)).toHaveLength(1)
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

  it('removes the redundant Features source and license callout', () => {
    act(() => {
      root.render(<FeaturesSection />)
    })

    expect(container.querySelector('.gh-cta')).toBeNull()
    expect(container.textContent).not.toContain('Public Alpha. Portable data. Source available.')
    expect(container.textContent).not.toContain('PolyForm Noncommercial 1.0.0')
  })

  it('does not render the removed workspace-proof section', () => {
    act(() => {
      root.render(<Homepage onCreate={vi.fn()} />)
    })

    expect(container.textContent).not.toContain('One file. Phases, tasks, and what to build next.')
    expect(container.querySelector('#proof')).toBeNull()
  })

  it('uses native How it works and Features hash links with one active-section observer', () => {
    const how = document.createElement('section')
    how.id = 'how'
    how.scrollIntoView = vi.fn()
    const features = document.createElement('section')
    features.id = 'features'
    features.scrollIntoView = vi.fn()
    document.body.appendChild(how)
    document.body.appendChild(features)
    window.history.replaceState({}, '', '/#how')

    act(() => {
      root.render(<SiteHeader onCreate={vi.fn()} />)
    })

    const links = container.querySelectorAll('nav a')
    const howLink = links[0]
    const featuresLink = links[1]
    expect(howLink?.getAttribute('href')).toBe('#how')
    expect(howLink?.textContent).toBe('How it works')
    expect(featuresLink?.getAttribute('href')).toBe('#features')
    expect(howLink?.classList.contains('active')).toBe(true)
    expect(how.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })

    act(() => {
      intersectionCallback?.([{ isIntersecting: true, target: features } as unknown as IntersectionObserverEntry], {} as IntersectionObserver)
    })
    expect(howLink?.classList.contains('active')).toBe(false)
    expect(featuresLink?.classList.contains('active')).toBe(true)

    window.history.replaceState({}, '', '/#how')
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(howLink?.classList.contains('active')).toBe(true)
    expect(featuresLink?.classList.contains('active')).toBe(false)
    how.remove()
    features.remove()
  })

  it('hydrates a direct Features hash link as active', () => {
    const features = document.createElement('section')
    features.id = 'features'
    features.scrollIntoView = vi.fn()
    document.body.appendChild(features)
    window.history.replaceState({}, '', '/#features')

    act(() => {
      root.render(<SiteHeader onCreate={vi.fn()} />)
    })

    expect(container.querySelector('nav a[href="#features"]')?.classList.contains('active')).toBe(true)
    expect(features.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    features.remove()
  })

  it('places the flow strip after the three How it works cards exactly once', () => {
    act(() => {
      root.render(<HowItWorksSection />)
    })

    const steps = container.querySelector('.steps')
    const flowStrips = container.querySelectorAll('.flow-strip')
    expect(container.querySelectorAll('.step-card')).toHaveLength(3)
    expect(flowStrips).toHaveLength(1)
    if (!steps || !flowStrips[0]) throw new Error('How it works content should render')
    expect(steps.compareDocumentPosition(flowStrips[0])).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('keeps the preview representative of the workspace', () => {
    act(() => {
      root.render(<HeroSection onCreate={vi.fn()} />)
    })

    const preview = container.querySelector('.preview-mini')
    expect(preview?.textContent).toContain('ROADMAP')
    expect(preview?.textContent).toContain('Roadmap')
    expect(preview?.textContent).toContain('Activity')
    expect(preview?.textContent).toContain('Search tasks')
    expect(preview?.querySelectorAll('.phase-mini')).toHaveLength(3)
    expect(preview?.querySelectorAll('.task-mini.done')).toHaveLength(3)
    expect(preview?.querySelector('.task-status.recommended')?.textContent).toBe('NEXT')
    expect(preview?.querySelector('.preview-progress')).not.toBeNull()
  })

  it('keeps landing sections in normal flow with responsive grids, bottom spacing, and sticky-header offset rules', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/site.css'), 'utf8')
    const baseCss = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8')

    expect(css).toContain('--landing-section-padding-start')
    expect(css).toContain('--landing-section-padding-end')
    expect(css).toContain('--landing-section-heading-gap')
    expect(css).toContain('--landing-section-content-gap')
    expect(css).not.toMatch(/\.section\s*\{[^}]*height:\s*100vh/)
    expect(css).not.toMatch(/\.section\s*\{[^}]*overflow:\s*hidden/)
    expect(css).toContain('grid-template-columns: repeat(2, 1fr)')
    expect(css).toContain('grid-template-columns: 1fr')
    expect(css).toContain('.feature-head')
    expect(css).toContain('grid-template-rows: auto auto auto minmax(0, 1fr) auto')
    expect(css).toContain('height: clamp(430px, 48svh, 500px)')
    expect(css).toContain('height: clamp(360px, 48svh, 380px)')
    expect(css).toContain('padding: var(--landing-section-padding-start) 0 var(--landing-section-padding-end)')
    expect(css).toContain('min-height: calc(100svh - var(--site-header-height))')
    expect(css).not.toContain('.hero .eyebrow')
    expect(baseCss).toContain('section[id] { scroll-margin-top: var(--header-h); }')
  })
})
