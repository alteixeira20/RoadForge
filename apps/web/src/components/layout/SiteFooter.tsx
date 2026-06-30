'use client'

import { Brand } from '@/components/ui/Brand'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="row">
        <Brand />
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span>Public Beta · WIP · PolyForm Noncommercial 1.0.0</span>
        <span className="flex-1" />
        <div className="links">
          <a
            href="https://github.com/alteixeira20/roadforge"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a
            href="https://github.com/alteixeira20/roadforge/tree/main/docs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Docs
          </a>
          <a
            href="https://github.com/alteixeira20/roadforge/blob/main/deploy/hosting-bay/README.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            Self-host guide
          </a>
          <a
            href="https://github.com/alteixeira20/roadforge/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
          >
            License
          </a>
        </div>
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
