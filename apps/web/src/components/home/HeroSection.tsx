'use client'

import { Icon } from '@/components/ui/Icon'
import { MiniPreview } from './MiniPreview'

interface HeroSectionProps {
  onCreate: () => void
}

export function HeroSection({ onCreate }: HeroSectionProps) {
  return (
    <section className="hero container">
      <h1>
        A roadmap tool that{' '}
        <span className="accent">starts local, stays portable.</span>
      </h1>
      <p className="lede">
        Plan in phases, track tasks and dependencies, and work entirely on
        your device. Save to a server later when you need to share.
        No account required to start.
      </p>
      <div className="ctas">
        <button className="btn primary lg" onClick={onCreate}>
          Create roadmap <Icon name="arrow-right" size={16} stroke="#fff" />
        </button>
        <a
          className="btn lg secondary"
          href="https://github.com/alteixeira20/RoadForge"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="github" size={16} /> View source
        </a>
      </div>
      <div className="preview-wrap">
        <div className="preview">
          <div className="preview-bar">
            <span className="dots"><i /><i /><i /></span>
            <span className="url">roadforge.anvilary.tools · API Integration Sprint</span>
          </div>
          <MiniPreview />
        </div>
      </div>
      <div className="meta-row" aria-label="RoadForge highlights">
        <span><Icon name="lock" size={14} /> No account required</span>
        <span><Icon name="device" size={14} /> Runs locally</span>
        <span><Icon name="export" size={14} /> Portable exports</span>
        <span><Icon name="shield" size={14} /> Non-commercial source available</span>
      </div>
    </section>
  )
}
