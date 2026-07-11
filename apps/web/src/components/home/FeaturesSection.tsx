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
          <h3>Portable exports</h3>
          <p>
            Keep a canonical JSON backup and generate readable Markdown.
            Your roadmap is never locked to one service.
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
          <h3>Tool-readable planning</h3>
          <p>
            The structured JSON format works with version control, scripts,
            and compatible planning tools while RoadForge remains the source of truth.
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
          <h3>Self-hostable source</h3>
          <p>
            Run RoadForge on your own infrastructure under the repository&apos;s
            non-commercial source-available license.
          </p>
        </div>
      </div>
      <div className="gh-cta">
        <div className="gh-cta-text">
          <strong>Public Alpha. Portable data. Source available.</strong>
          <span>PolyForm Noncommercial 1.0.0</span>
        </div>
        <a
          className="btn lg secondary"
          href="https://github.com/alteixeira20/RoadForge"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="github" size={16} /> View source
        </a>
      </div>
    </LandingSectionFrame>
  )
}
