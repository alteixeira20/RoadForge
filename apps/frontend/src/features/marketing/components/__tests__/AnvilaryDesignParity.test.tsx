// @vitest-environment jsdom
import React, { act } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SiteHeader } from '@/features/marketing/components/SiteHeader'
import { SiteFooter } from '@/shared/ui/SiteFooter'
import { AppHeader } from '@/features/workspace/components/AppHeader'

vi.mock('@/features/roadmaps/components/RoadmapSwitcher', () => ({
  RoadmapSwitcher: () => <div data-testid="roadmap-switcher" />,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Anvilary Design Parity for Marketing Header and Footer', () => {
  it('renders marketing header with full-width layout, RoadForge 80px logo, and nav labels', () => {
    act(() => {
      root.render(<SiteHeader onCreate={vi.fn()} />)
    })

    const header = container.querySelector('header.site-header')
    expect(header).not.toBeNull()
    // Must NOT constrain the header element with the .container class
    expect(header?.classList.contains('container')).toBe(false)

    // RoadForge branding in header
    const brand = header?.querySelector('.brand.brand-lg')
    expect(brand).not.toBeNull()
    const logoImg = brand?.querySelector('img.brand-logo-img')
    expect(logoImg).not.toBeNull()
    expect(decodeURIComponent(logoImg?.getAttribute('src') || '')).toContain('/brand/roadforge/logo.png')
    expect(logoImg?.getAttribute('width')).toBe('80')
    expect(logoImg?.getAttribute('height')).toBe('80')
    expect(brand?.textContent).toContain('RoadForge')

    // Navigation underline wraps text in .nav-label
    const navLinks = header?.querySelectorAll('nav a')
    expect(navLinks?.length).toBe(3)
    navLinks?.forEach((link) => {
      const label = link.querySelector('.nav-label')
      expect(label).not.toBeNull()
    })

    // Canonical repository link in header
    const sourceLink = header?.querySelector('a.gh-pill')
    expect(sourceLink?.getAttribute('href')).toBe('https://github.com/Anvilary/RoadForge')
    expect(sourceLink?.getAttribute('target')).toBe('_blank')

    // Actions preserved
    const createBtn = header?.querySelector('button.btn.primary')
    expect(createBtn?.textContent).toContain('Create roadmap')
    expect(header?.querySelector('[data-testid="roadmap-switcher"]')).not.toBeNull()
  })

  it('renders marketing footer with fixed chrome structure, parent Anvilary logo, and required links', () => {
    act(() => {
      root.render(<SiteFooter />)
    })

    const footer = container.querySelector('footer.site-footer')
    expect(footer).not.toBeNull()

    // Anvilary parent brand in footer
    const brandLink = footer?.querySelector('a.anvilary-brand')
    expect(brandLink).not.toBeNull()
    expect(brandLink?.getAttribute('href')).toBe('https://anvilary.tools/')
    expect(brandLink?.getAttribute('target')).toBe('_blank')

    const parentImg = brandLink?.querySelector('img')
    expect(parentImg).not.toBeNull()
    expect(decodeURIComponent(parentImg?.getAttribute('src') || '')).toContain('/brand/anvilary-tools/logo.png')
    expect(parentImg?.getAttribute('width')).toBe('28')
    expect(parentImg?.getAttribute('height')).toBe('28')

    // Wordmark has gradient structure Anvilary.Tools
    const brandName = brandLink?.querySelector('.brand-name')
    const brandSuffix = brandLink?.querySelector('.brand-suffix')
    expect(brandName?.textContent).toBe('Anvilary')
    expect(brandSuffix?.textContent).toBe('.Tools')

    // Product identity, source, license, and issue reporting
    expect(footer?.textContent).toContain('RoadForge · Pre-release · An Anvilary product')
    const githubLink = footer?.querySelector('a[href="https://github.com/Anvilary/RoadForge"]')
    expect(githubLink?.textContent).toBe('GitHub')

    const licenseLink = footer?.querySelector('a[href="https://github.com/Anvilary/RoadForge#license"]')
    expect(licenseLink?.textContent).toContain('Non-commercial source available')

    const reportLink = footer?.querySelector('a[title*="Report a problem"]')
    expect(reportLink).not.toBeNull()
    expect(footer?.textContent).toContain('©')
    expect(footer?.textContent).toContain('Anvilary Tools')
  })

  it('verifies stylesheet geometry, surface, blur, and glow rules', () => {
    const siteCss = readFileSync(
      resolve(process.cwd(), 'src/styles/site.css'),
      'utf8',
    )
    const tokensCss = readFileSync(
      resolve(process.cwd(), 'src/styles/tokens.css'),
      'utf8',
    )

    // Token contracts
    expect(tokensCss).toContain('--chrome-surface: color-mix(in oklab, var(--bg) 88%, transparent);')
    expect(tokensCss).toContain('--chrome-surface-footer: color-mix(in oklab, var(--bg) 93%, transparent);')
    expect(tokensCss).toContain('--chrome-blur: 14px;')
    expect(tokensCss).toContain('--chrome-border-line:')
    expect(tokensCss).toContain('--chrome-border-glow:')
    expect(tokensCss).toContain('--site-header-height: 118px;')

    // Header layout and glow
    expect(siteCss).toContain('height: 118px;')
    expect(siteCss).toContain('padding: 0 max(32px, calc((100% - var(--container)) / 2 + 32px));')
    expect(siteCss).toContain('.site-header::after')
    expect(siteCss).toContain('.site-header::before')
    expect(siteCss).toContain('background: var(--chrome-border-glow);')

    // Footer fixed layout and glow
    expect(siteCss).toContain('position: fixed;')
    expect(siteCss).toContain('bottom: 0;')
    expect(siteCss).toContain('z-index: 40;')
    expect(siteCss).toContain('background: var(--chrome-surface-footer);')
    expect(siteCss).toContain('.site-footer::after')
    expect(siteCss).toContain('.site-footer::before')

    // Navigation label underline
    expect(siteCss).toContain('.site-header nav a .nav-label::after')

    // Page bottom clearance for fixed footer
    expect(siteCss).toContain('padding-bottom: var(--site-footer-height, 56px);')
  })

  it('preserves workspace header isolation without applying marketing header styles', () => {
    act(() => {
      root.render(
        <AppHeader
          roadmapName="Isolated Workspace Roadmap"
          syncStatus="local"
          onIO={vi.fn()}
        />,
      )
    })

    const appHeader = container.querySelector('header.app-header')
    expect(appHeader).not.toBeNull()

    // Workspace uses brand-mini, not brand-lg
    const workspaceBrand = appHeader?.querySelector('.brand-mini')
    expect(workspaceBrand).not.toBeNull()
    expect(workspaceBrand?.classList.contains('brand-lg')).toBe(false)

    // Logo size in workspace remains 28px
    const img = workspaceBrand?.querySelector('img')
    expect(img?.getAttribute('width')).toBe('28')
    expect(img?.getAttribute('height')).toBe('28')
  })
})
