'use client'

import { Icon } from '@/shared/ui/Icon'

interface HeroSectionProps {
  onCreate: () => void
}

export function HeroSection({ onCreate }: HeroSectionProps) {
  return (
    <section className="hero" id="hero">
      <div className="hero-inner container">
        <h1>
          A roadmap tool that{' '}
          <span className="accent">starts local, stays portable.</span>
        </h1>
        <div className="ctas">
          <button className="btn primary lg" onClick={onCreate}>
            Try the Hosted demo <Icon name="arrow-right" size={16} stroke="#fff" />
          </button>
          <a
            className="btn lg secondary"
            href="https://github.com/Anvilary/RoadForge"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="github" size={16} /> Fork / self-host
          </a>
        </div>
        <div className="meta-row" aria-label="RoadForge highlights">
          <span><Icon name="lock" size={14} /> No account required</span>
          <span><Icon name="device" size={14} /> Local-first</span>
          <span><Icon name="export" size={14} /> Portable exports</span>
          <span><Icon name="shield" size={14} /> Self-host for team use</span>
        </div>
      </div>
    </section>
  )
}
