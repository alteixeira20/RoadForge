import { Icon } from '@/components/ui/Icon'
import { LandingSectionFrame } from '@/components/home/LandingSectionFrame'

export function FeaturesSection() {
  return (
    <LandingSectionFrame
      id="features"
      className="features-section"
      title="Built for solo builders and small teams."
      lede="A focused set of features, sized to fit how real planning works. The public instance is a demo; teams can run RoadForge on infrastructure they control."
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
            <h3>Tool-readable planning</h3>
          </div>
          <p>
            Stable, inspectable JSON works with compatible tools, scripts, and
            version control while RoadForge remains the source of truth.
          </p>
        </div>
        <div className="feature">
          <div className="feature-head">
            <div className="ic"><Icon name="users" size={20} /></div>
            <h3>Optional sync and sharing</h3>
          </div>
          <p>
            Work locally first; add server sync only for participants, share
            links, activity history, and realtime collaboration.
          </p>
        </div>
        <div className="feature">
          <div className="feature-head">
            <div className="ic"><Icon name="shield" size={20} /></div>
            <h3>Fork and self-host</h3>
          </div>
          <p>
            Use the hosted demo to evaluate RoadForge. For sustained or larger-team
            use, run a fork or controlled clone on infrastructure you operate under
            the repository&apos;s non-commercial source-available license.
          </p>
        </div>
      </div>
    </LandingSectionFrame>
  )
}
