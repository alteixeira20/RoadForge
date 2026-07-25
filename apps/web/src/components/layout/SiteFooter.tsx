'use client'

import { Brand } from '@/components/ui/Brand'
import {
  ProblemReportLink,
  PROBLEM_REPORT_PRIVACY_WARNING,
} from '@/components/ui/ProblemReportLink'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="row">
        <Brand />
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span>Pre-release · An Anvilary product</span>
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
        <span>Local-first. Portable. Self-hostable.</span>
      </div>
    </footer>
  )
}
