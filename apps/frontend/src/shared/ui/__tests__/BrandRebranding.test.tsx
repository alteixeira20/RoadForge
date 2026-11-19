// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Brand } from '@/shared/ui/Brand'

describe('RoadForge visual rebranding and assets', () => {
  it('renders Brand component with the approved RoadForge logo', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(<Brand />)
    })

    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(decodeURIComponent(img?.getAttribute('src') || '')).toContain('/brand/roadforge/logo.png')
    expect(img?.getAttribute('width')).toBe('28')
    expect(img?.getAttribute('height')).toBe('28')
    expect(container.textContent).toContain('RoadForge')

    act(() => {
      root.unmount()
    })
  })

  it('declares approved RoadForge metadata, favicons, and social cards in layout', () => {
    const layoutPath = resolve(process.cwd(), 'src/app/layout.tsx')
    const layoutContent = readFileSync(layoutPath, 'utf8')

    expect(layoutContent).toContain("url: '/favicon.ico'")
    expect(layoutContent).toContain("url: '/favicon-32x32.png'")
    expect(layoutContent).toContain("url: '/favicon-16x16.png'")
    expect(layoutContent).toContain("url: '/favicon-48x48.png'")
    expect(layoutContent).toContain("url: '/apple-touch-icon.png'")
    expect(layoutContent).toContain("url: '/brand/roadforge/social-preview.png'")
    expect(layoutContent).toContain("card: 'summary_large_image'")
    expect(layoutContent).not.toContain('anvilary-logo-mark')
  })

  it('validates PWA manifest structure, theme colors, and icons', () => {
    const manifestPath = resolve(process.cwd(), 'public/site.webmanifest')
    expect(existsSync(manifestPath)).toBe(true)

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    expect(manifest.name).toBe('RoadForge')
    expect(manifest.short_name).toBe('RoadForge')
    expect(manifest.theme_color).toBe('#0e0e10')
    expect(manifest.background_color).toBe('#0e0e10')
    expect(manifest.display).toBe('standalone')

    const iconSrcs = manifest.icons.map((i: { src: string }) => i.src)
    expect(iconSrcs).toContain('/android-chrome-192x192.png')
    expect(iconSrcs).toContain('/android-chrome-512x512.png')
    expect(iconSrcs).toContain('/android-maskable-192x192.png')
    expect(iconSrcs).toContain('/android-maskable-512x512.png')

    const maskableIcons = manifest.icons.filter((i: { purpose?: string }) => i.purpose === 'maskable')
    expect(maskableIcons.length).toBe(2)
  })

  it('confirms all definitive production assets exist with non-zero size', () => {
    const publicDir = resolve(process.cwd(), 'public')
    const requiredFiles = [
      'favicon.ico',
      'favicon-16x16.png',
      'favicon-32x32.png',
      'favicon-48x48.png',
      'apple-touch-icon.png',
      'android-chrome-192x192.png',
      'android-chrome-512x512.png',
      'android-maskable-192x192.png',
      'android-maskable-512x512.png',
      'site.webmanifest',
      'brand/roadforge/logo.png',
      'brand/roadforge/logo-512.png',
      'brand/roadforge/social-preview.png',
      'brand/roadforge/final/logo.png',
      'brand/roadforge/final/logo-512.png',
      'brand/roadforge/final/favicon.ico',
      'brand/roadforge/final/favicon-16x16.png',
      'brand/roadforge/final/favicon-32x32.png',
      'brand/roadforge/final/favicon-48x48.png',
      'brand/roadforge/final/apple-touch-icon.png',
      'brand/roadforge/final/android-chrome-192x192.png',
      'brand/roadforge/final/android-chrome-512x512.png',
      'brand/roadforge/final/android-maskable-192x192.png',
      'brand/roadforge/final/android-maskable-512x512.png',
    ]

    for (const rel of requiredFiles) {
      const fullPath = resolve(publicDir, rel)
      expect(existsSync(fullPath), `Expected ${rel} to exist`).toBe(true)
      expect(statSync(fullPath).size, `Expected ${rel} to be non-empty`).toBeGreaterThan(0)
    }
  })

  it('confirms obsolete branding assets have been removed from public directory', () => {
    const publicDir = resolve(process.cwd(), 'public')
    const obsoleteFiles = [
      'android-chrome-192x192-dark-ui.png',
      'android-chrome-512x512-dark-ui.png',
      'brand/anvilary-logo-mark-tight-white.png',
      'brand/anvilary-logo-mark-square-32-white.png',
      'brand/forge-apps-logo-mark-tight-white.png',
    ]

    for (const rel of obsoleteFiles) {
      const fullPath = resolve(publicDir, rel)
      expect(existsSync(fullPath), `Expected ${rel} to be removed`).toBe(false)
    }
  })
})
