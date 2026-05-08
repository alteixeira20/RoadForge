'use client'

import { useState, useEffect } from 'react'
import { Brand } from '@/components/ui/Brand'
import { Icon } from '@/components/ui/Icon'

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
        <a
          className="gh-pill"
          href="#"
          onClick={(e) => e.preventDefault()}
        >
          <Icon name="github" size={18} />
          <span>GitHub</span>
          <span className="stars">★ 2.4k</span>
        </a>
        <button className="btn primary" onClick={onCreate}>
          Create roadmap
        </button>
      </div>
    </header>
  )
}
