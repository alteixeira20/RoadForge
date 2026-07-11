'use client'

import { Brand } from '@/components/ui/Brand'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="row">
        <Brand />
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span>Public Alpha · RoadForge from Anvilary</span>
        <span className="flex-1" />
        <span>Private during alpha · Source release planned for beta</span>
      </div>
      <div className="row sub" style={{ marginTop: 16, color: 'var(--ink-4)', fontSize: 13 }}>
        <span>
          Created by{' '}
          <a href="https://github.com/alteixeira20/" target="_blank" rel="noopener noreferrer">
            Alexandre Teixeira
          </a>
        </span>
        <span className="flex-1" />
        <span>Built locally. Optionally yours to host.</span>
      </div>
    </footer>
  )
}
