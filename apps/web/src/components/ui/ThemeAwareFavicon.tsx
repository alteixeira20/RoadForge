'use client'

import { useEffect } from 'react'

const VERSION = 'anvilary-theme'

const LIGHT_ICONS = {
  shortcut: `/favicon.ico?v=${VERSION}`,
  16: `/favicon-16x16.png?v=${VERSION}`,
  32: `/favicon-32x32.png?v=${VERSION}`,
  48: `/favicon-48x48.png?v=${VERSION}`,
}

const DARK_ICONS = {
  shortcut: `/brand/anvilary-logo-mark-square-32-white.png?v=${VERSION}`,
  16: `/brand/anvilary-logo-mark-square-32-white.png?v=${VERSION}`,
  32: `/brand/anvilary-logo-mark-square-32-white.png?v=${VERSION}`,
  48: `/brand/anvilary-logo-mark-square-48-white.png?v=${VERSION}`,
}

function upsertIconLink(rel: string, href: string, sizes?: string) {
  const selector = sizes
    ? `link[rel="${rel}"][sizes="${sizes}"]`
    : `link[rel="${rel}"]:not([sizes])`
  let link = document.head.querySelector<HTMLLinkElement>(selector)

  if (!link) {
    link = document.createElement('link')
    link.rel = rel
    if (sizes) link.setAttribute('sizes', sizes)
    document.head.appendChild(link)
  }

  link.href = href
  if (href.endsWith('.png') || href.includes('.png?')) {
    link.type = 'image/png'
  } else {
    link.type = 'image/x-icon'
  }
}

function applyFavicon(prefersDark: boolean) {
  const icons = prefersDark ? DARK_ICONS : LIGHT_ICONS

  upsertIconLink('shortcut icon', icons.shortcut)
  upsertIconLink('icon', icons[16], '16x16')
  upsertIconLink('icon', icons[32], '32x32')
  upsertIconLink('icon', icons[48], '48x48')
}

export function ThemeAwareFavicon() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    applyFavicon(media.matches)

    const handleChange = (event: MediaQueryListEvent) => {
      applyFavicon(event.matches)
    }

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  return null
}
