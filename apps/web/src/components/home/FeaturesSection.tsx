'use client'

import { Icon } from '@/components/ui/Icon'
import { LandingSectionFrame } from '@/components/home/LandingSectionFrame'

export function FeaturesSection() {
  return (
    <LandingSectionFrame
      id="features"
      title="Built for solo builders and small teams."
      lede="A focused set of features, sized to fit how real planning works."
    >
      <div className="features">
        <div className="feature">
          <div className="ic"><Icon name="device" size={20} /></div>
          <h3>Local-first</h3>
          <p>
            Edits land on your device first. No round-trips, no spinner, no
            internet required.
          </p>
        </div>
        <div className="feature">
          <div className="ic"><Icon name="export" size={20} /></div>
          <h3>Portable JSON</h3>
          <p>
            Export and import the full roadmap as JSON. Readable, versionable,
            and never locked to a service.
          </p>
        </div>
        <div className="feature">
          <div className="ic"><Icon name="fold" size={20} /></div>
          <h3>Phase and task structure</h3>
          <p>
            Group work into phases. Track tasks, dependencies, and status.
            Collapse what you don&apos;t need to see right now.
          </p>
        </div>
        <div className="feature">
          <div className="ic"><Icon name="robot" size={20} /></div>
          <h3>Agent-readable planning</h3>
          <p>
            A structured file humans and coding agents both understand. Agents
            can read the plan and propose changes — you approve.
          </p>
        </div>
        <div className="feature">
          <div className="ic"><Icon name="users" size={20} /></div>
          <h3>Optional sync and sharing</h3>
          <p>
            Save to a server when you want participants, an activity log, or
            signed invite links. The local version always works first.
          </p>
        </div>
        <div className="feature">
          <div className="ic"><Icon name="shield" size={20} /></div>
          <h3>Self-hosting at beta</h3>
          <p>
            A non-commercial source-available release is planned for
            self-hosting when RoadForge is beta-ready.
          </p>
        </div>
      </div>
      <div className="gh-cta">
        <div className="gh-cta-text">
          <strong>Private alpha. Portable JSON. Public source release planned.</strong>
          <span>Public Alpha · Future non-commercial source-available release</span>
        </div>
        <span className="btn lg secondary">
          <Icon name="github" size={16} /> Source at beta
        </span>
      </div>
    </LandingSectionFrame>
  )
}
