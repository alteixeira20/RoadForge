'use client'

import { Icon } from '@/components/ui/Icon'
import { MiniPreview } from './MiniPreview'

interface HeroSectionProps {
  onCreate: () => void
}

export function HeroSection({ onCreate }: HeroSectionProps) {
  return (
    <>
      <section className="hero container">
        <h1>
          The roadmap tool that{' '}
          <span className="accent">starts on your machine.</span>
        </h1>
        <p className="lede">
          Plan in phases. Forge your roadmap locally — no account, no sign-up.
          Save it to a server later if you want collaboration. Built so people
          and AI agents read the same file.
        </p>
        <div className="ctas">
          <button className="btn primary lg" onClick={onCreate}>
            Create roadmap <Icon name="arrow-right" size={16} stroke="#fff" />
          </button>
          <a className="btn lg" href="#" onClick={(e) => e.preventDefault()}>
            <Icon name="github" size={16} /> View on GitHub
          </a>
        </div>
        <div className="meta-row">
          <span><Icon name="lock" size={14} /> No account required</span>
          <span><Icon name="github" size={14} /> Open-source</span>
          <span><Icon name="device" size={14} /> Local hosting</span>
          <span><Icon name="shield" size={14} /> MIT licensed</span>
        </div>
      </section>

      <div className="preview-wrap">
        <div className="preview">
          <div className="preview-bar">
            <span className="dots"><i /><i /><i /></span>
            <span className="url">roadforge.local · v1.0 Public Launch</span>
          </div>
          <MiniPreview />
        </div>
      </div>
    </>
  )
}
