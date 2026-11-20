'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Brand } from '@/shared/ui/Brand'
import { Icon } from '@/shared/ui/Icon'
import { RoadmapSwitcher } from '@/features/roadmaps/components/RoadmapSwitcher'

interface SiteHeaderProps {
  onCreate: () => void
}

export function SiteHeader({ onCreate }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const headerRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header) return

    const updateHeaderHeight = () => {
      document.documentElement.style.setProperty(
        '--site-header-height',
        `${header.getBoundingClientRect().height}px`,
      )
    }

    updateHeaderHeight()
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateHeaderHeight)
    observer?.observe(header)
    window.addEventListener('resize', updateHeaderHeight)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateHeaderHeight)
      document.documentElement.style.removeProperty('--site-header-height')
    }
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const sections = ['how', 'features']
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null)
    if (sections.length === 0 || !('IntersectionObserver' in window)) return

    const syncHash = () => {
      const section = sections.find(({ id }) => window.location.hash === `#${id}`)
      setActiveSection(section?.id ?? null)
    }
    syncHash()
    const directSection = sections.find(({ id }) => window.location.hash === `#${id}`)
    directSection?.scrollIntoView({ block: 'start' })
    const observer = new IntersectionObserver(
      (entries) => {
        const activeEntry = entries.find((entry) => entry.isIntersecting)
        if (activeEntry) setActiveSection(activeEntry.target.id)
      },
      { rootMargin: '-118px 0px -55% 0px', threshold: 0 },
    )
    sections.forEach((section) => observer.observe(section))
    window.addEventListener('hashchange', syncHash)
    window.addEventListener('popstate', syncHash)
    return () => {
      observer.disconnect()
      window.removeEventListener('hashchange', syncHash)
      window.removeEventListener('popstate', syncHash)
    }
  }, [])

  return (
    <header
      ref={headerRef}
      className={`site-header ${scrolled ? 'scrolled' : ''}`}
    >
      <Brand href="/#hero" size="lg" />
      <nav aria-label="Main">
        <a
          className={activeSection === 'how' ? 'active' : undefined}
          href="#how"
          aria-current={activeSection === 'how' ? 'page' : undefined}
        >
          <span className="nav-label">How it works</span>
        </a>
        <a
          className={activeSection === 'features' ? 'active' : undefined}
          href="#features"
          aria-current={activeSection === 'features' ? 'page' : undefined}
        >
          <span className="nav-label">Features</span>
        </a>
        <a href="/help">
          <span className="nav-label">Help</span>
        </a>
      </nav>
      <span className="spacer" />
      <div className="actions">
        <a
          className="gh-pill"
          href="https://github.com/Anvilary/RoadForge"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="github" size={18} />
          <span>Source</span>
        </a>
        <button className="btn primary" onClick={onCreate}>
          Create roadmap
        </button>
        <RoadmapSwitcher
          variant="header"
          hideWhenEmpty
          label="Open saved roadmaps"
          onCreate={onCreate}
        />
      </div>
    </header>
  )
}
