'use client'

import { useState, useEffect } from 'react'
import { Brand } from '@/components/ui/Brand'
import { Icon } from '@/components/ui/Icon'
import { RoadmapSwitcher } from '@/components/roadmap/RoadmapSwitcher'

interface SiteHeaderProps {
  onCreate: () => void
}

export function SiteHeader({ onCreate }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const [featuresActive, setFeaturesActive] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const features = document.getElementById('features')
    if (!features || !('IntersectionObserver' in window)) return

    const isDirectFeaturesLink = window.location.hash === '#features'
    setFeaturesActive(isDirectFeaturesLink)
    if (isDirectFeaturesLink) features.scrollIntoView({ block: 'start' })
    const observer = new IntersectionObserver(
      ([entry]) => setFeaturesActive(entry.isIntersecting),
      { rootMargin: '-76px 0px -55% 0px', threshold: 0 },
    )
    observer.observe(features)
    return () => observer.disconnect()
  }, [])

  return (
    <header className={`site-header ${scrolled ? 'scrolled' : ''}`}>
      <Brand href="/" />
      <nav>
        <a className={featuresActive ? 'active' : undefined} href="#features" aria-current={featuresActive ? 'page' : undefined}>
          Features
        </a>
      </nav>
      <span className="spacer" />
      <div className="actions">
        <a
          className="gh-pill"
          href="https://github.com/alteixeira20/RoadForge"
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
