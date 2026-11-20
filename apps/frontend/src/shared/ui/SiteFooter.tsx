'use client'

import { useLayoutEffect, useRef } from 'react'
import Image from 'next/image'
import {
  ProblemReportLink,
  PROBLEM_REPORT_PRIVACY_WARNING,
} from '@/shared/ui/ProblemReportLink'

export function SiteFooter() {
  const footerRef = useRef<HTMLElement>(null)
  const year = new Date().getFullYear()

  useLayoutEffect(() => {
    const footer = footerRef.current
    if (!footer) return

    const updateFooterHeight = () => {
      document.documentElement.style.setProperty(
        '--site-footer-height',
        `${footer.getBoundingClientRect().height}px`,
      )
    }

    updateFooterHeight()
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateFooterHeight)
    observer?.observe(footer)
    window.addEventListener('resize', updateFooterHeight)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateFooterHeight)
      document.documentElement.style.removeProperty('--site-footer-height')
    }
  }, [])

  return (
    <footer ref={footerRef} className="site-footer">
      <div className="row">
        <a
          href="https://anvilary.tools/"
          target="_blank"
          rel="noopener noreferrer"
          className="anvilary-brand brand"
        >
          <span className="brand-logo" aria-hidden="true">
            <Image
              className="brand-logo-img"
              src="/brand/anvilary-tools/logo.png"
              alt=""
              width={28}
              height={28}
            />
          </span>
          <span className="brand-text">
            <span className="brand-name">Anvilary</span>
            <span className="brand-suffix">.Tools</span>
          </span>
        </a>
        <span className="dot" aria-hidden="true">·</span>
        <span>RoadForge · Pre-release · An Anvilary product · Hosted demo</span>
        <span className="dot" aria-hidden="true">·</span>
        <a
          href="https://github.com/Anvilary/RoadForge"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        <span className="dot" aria-hidden="true">·</span>
        <ProblemReportLink />
        <span className="problem-report-privacy sr-only">
          {PROBLEM_REPORT_PRIVACY_WARNING}
        </span>
        <span className="sr-only">
          Local-first. Portable. Self-hostable. Fork/self-host for team use
        </span>
        <span className="flex-1" />
        <a
          href="https://github.com/Anvilary/RoadForge#license"
          target="_blank"
          rel="noopener noreferrer"
        >
          Non-commercial source available
        </a>
        <span className="dot" aria-hidden="true">·</span>
        <span>© {year} Anvilary Tools</span>
      </div>
    </footer>
  )
}
