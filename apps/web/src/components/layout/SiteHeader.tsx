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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`site-header ${scrolled ? 'scrolled' : ''}`}>
      <Brand href="/" />
      <nav>
        <a href="#how">How it works</a>
        <a href="#features">Features</a>
      </nav>
      <span className="spacer" />
      <div className="actions">
        <span className="gh-pill muted">
          <Icon name="github" size={18} />
          <span>Source</span>
          <span className="stars">private</span>
        </span>
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
