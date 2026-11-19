'use client'

import Image from 'next/image'
import {
  ProblemReportLink,
  PROBLEM_REPORT_PRIVACY_WARNING,
} from '@/shared/ui/ProblemReportLink'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="row">
        <a
          href="https://anvilary.tools/"
          target="_blank"
          rel="noopener noreferrer"
          className="anvilary-brand"
        >
          <span className="anvilary-logo" aria-hidden="true">
            <Image
              className="anvilary-logo-img"
              src="/brand/anvilary-tools/logo.png"
              alt=""
              width={38}
              height={38}
            />
          </span>
          <span className="anvilary-wordmark">Anvilary Tools</span>
        </a>
        <span className="dot-sep" style={{ color: 'var(--ink-4)' }}>·</span>
        <span>Pre-release · An Anvilary product · Hosted demo</span>
        <span className="flex-1" />
        <span>Non-commercial source available</span>
      </div>
      <div className="row sub" style={{ marginTop: 16, color: 'var(--ink-4)', fontSize: 13 }}>
        <a href="https://anvilary.tools" target="_blank" rel="noopener noreferrer">
          anvilary.tools
        </a>
        <ProblemReportLink />
        <span className="problem-report-privacy">{PROBLEM_REPORT_PRIVACY_WARNING}</span>
        <span className="flex-1" />
        <span>Local-first. Portable. Self-hostable. · Fork/self-host for team use</span>
      </div>
    </footer>
  )
}
