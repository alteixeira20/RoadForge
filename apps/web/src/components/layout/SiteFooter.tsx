'use client'

import { Brand } from '@/components/ui/Brand'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="row">
        <Brand />
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span>MIT licensed · v1.0</span>
        <span className="flex-1" />
        <div className="links">
          <span className="footer-link-muted">GitHub</span>
          <span className="footer-link-muted">Docs</span>
          <span className="footer-link-muted">Self-host guide</span>
          <span className="footer-link-muted">Changelog</span>
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
