import { Icon } from '@/components/ui/Icon'
import { LandingSectionFrame } from '@/components/home/LandingSectionFrame'

export function FeaturesSection() {
  return (
    <LandingSectionFrame
      id="features"
      className="features-section"
      title="Built for focused local planning."
      lede="A small, durable roadmap workspace for one builder today, with optional local service backing for API and agent access. Team features are intentionally dormant for now."
    >
      <div className="features">
        <div className="feature">
          <div className="feature-head">
            <div className="ic"><Icon name="device" size={20} /></div>
            <h3>Local-first</h3>
          </div>
          <p>
            Edits land on your device first. No round-trips, no spinner, no
            internet required.
          </p>
        </div>
        <div className="feature">
          <div className="feature-head">
            <div className="ic"><Icon name="export" size={20} /></div>
            <h3>Portable exports</h3>
          </div>
          <p>
            Keep a canonical JSON backup, readable Markdown, and portable
            import/export—without service lock-in.
          </p>
        </div>
        <div className="feature">
          <div className="feature-head">
            <div className="ic"><Icon name="fold" size={20} /></div>
            <h3>Structured planning</h3>
          </div>
          <p>
            Organize phases and tasks, track dependencies and progress, and let
            RoadForge surface recommended tasks without deciding your workflow for you.
          </p>
        </div>
        <div className="feature">
          <div className="feature-head">
            <div className="ic"><Icon name="robot" size={20} /></div>
            <h3>API and agent access</h3>
          </div>
          <p>
            Back a roadmap with the local RoadForge service when tools, scripts,
            or MCP-connected coding agents need durable machine-local access.
          </p>
        </div>
        <div className="feature">
          <div className="feature-head">
            <div className="ic"><Icon name="users" size={20} /></div>
            <h3>Team sharing</h3>
          </div>
          <p>
            In progress — available soon. Existing collaboration foundations are
            retained, but they are not active in the current solo product surface.
          </p>
        </div>
        <div className="feature">
          <div className="feature-head">
            <div className="ic"><Icon name="shield" size={20} /></div>
            <h3>Fork and self-host</h3>
          </div>
          <p>
            Use the hosted demo to evaluate RoadForge. For sustained or larger-team
            use later, run a fork or controlled clone on infrastructure you operate
            under the repository&apos;s non-commercial source-available license.
          </p>
        </div>
      </div>
    </LandingSectionFrame>
  )
}
