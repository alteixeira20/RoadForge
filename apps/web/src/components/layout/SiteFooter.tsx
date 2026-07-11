'use client'

import { Brand } from '@/components/ui/Brand'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="row">
        <Brand />
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span>Public Alpha · An Anvilary product</span>
        <span className="flex-1" />
        <span>Non-commercial source available</span>
      </div>
      <div className="row sub" style={{ marginTop: 16, color: 'var(--ink-4)', fontSize: 13 }}>
        <a href="https://anvilary.tools" target="_blank" rel="noopener noreferrer">
          anvilary.tools
        </a>
        <a
          href="https://github.com/alteixeira20/RoadForge/issues/new/choose"
          target="_blank"
          rel="noopener noreferrer"
        >
          Report an issue or give feedback
        </a>
        <span className="flex-1" />
        <span>Local-first. Portable. Self-hostable.</span>
      </div>
    </footer>
  )
}
