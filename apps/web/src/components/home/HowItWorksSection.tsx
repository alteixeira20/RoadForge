import { Icon } from '@/components/ui/Icon'
import { LandingSectionFrame } from '@/components/home/LandingSectionFrame'

export function HowItWorksSection() {
  return (
    <LandingSectionFrame
      id="how"
      title="From empty page to shipped roadmap."
      lede="Three steps. No setup. You can be planning in under a minute."
    >
      <div className="flow-strip" aria-hidden="true">
        <span>Local file</span>
        <span className="flow-sep">→</span>
        <span>Portable JSON</span>
        <span className="flow-sep">→</span>
        <span>Optional server sync</span>
      </div>
      <div className="steps">
        <div className="step-card">
          <div className="step-ic"><Icon name="device" size={17} /></div>
          <span className="num">STEP 01</span>
          <h3>Start locally.</h3>
          <p>
            Open Roadforge, name yourself, name your roadmap. Everything saves
            to your device — fast and private.
          </p>
        </div>
        <div className="step-card">
          <div className="step-ic"><Icon name="fold" size={17} /></div>
          <span className="num">STEP 02</span>
          <h3>Plan in phases.</h3>
          <p>
            Group work into phases. Add tasks. Note what depends on what.
            Collapse anything you don&apos;t need to see right now.
          </p>
        </div>
        <div className="step-card">
          <div className="step-ic"><Icon name="users" size={17} /></div>
          <span className="num">STEP 03</span>
          <h3>Collaborate when ready.</h3>
          <p>
            Save to a Roadforge server — yours or self-hosted — to unlock
            real-time presence, activity logs, and signed share links.
          </p>
        </div>
      </div>
    </LandingSectionFrame>
  )
}
