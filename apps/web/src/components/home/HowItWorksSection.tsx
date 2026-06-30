import { Icon } from '@/components/ui/Icon'
import { LandingSectionFrame } from '@/components/home/LandingSectionFrame'

export function HowItWorksSection() {
  return (
    <LandingSectionFrame
      id="how"
      title="Planning that stays in one place."
      lede="Notes in one app, tickets in another, decisions lost in chat. RoadForge keeps the plan in a single structured file — local by default, portable always."
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
            Open RoadForge, name your roadmap. Everything saves to your device —
            no account, no internet required.
          </p>
        </div>
        <div className="step-card">
          <div className="step-ic"><Icon name="fold" size={17} /></div>
          <span className="num">STEP 02</span>
          <h3>Plan in phases.</h3>
          <p>
            Group work into phases. Add tasks and note what depends on what.
            RoadForge surfaces the recommended next task automatically.
          </p>
        </div>
        <div className="step-card">
          <div className="step-ic"><Icon name="users" size={17} /></div>
          <span className="num">STEP 03</span>
          <h3>Share when ready.</h3>
          <p>
            Save to an RoadForge server — yours or self-hosted — to get activity
            logs, participant tracking, and signed invite links.
          </p>
        </div>
      </div>
    </LandingSectionFrame>
  )
}
