'use client'

import { Icon } from '@/components/ui/Icon'

export function FeaturesSection() {
  return (
    <section className="section container" id="features">
      <div className="section-head">
        <h2>Built for solo builders and small teams.</h2>
        <p className="section-lede">
          A small set of features, chosen carefully, sized to fit how real
          planning works.
        </p>
      </div>
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
          <div className="ic"><Icon name="users" size={20} /></div>
          <h3>Optional collaboration</h3>
          <p>
            Save a roadmap to a server when you want to share. Presence,
            activity log, signed links.
          </p>
        </div>
        <div className="feature">
          <div className="ic"><Icon name="robot" size={20} /></div>
          <h3>AI-friendly schema</h3>
          <p>
            One stable JSON file that humans and coding agents both read.
            Agents propose; you approve.
          </p>
        </div>
        <div className="feature">
          <div className="ic"><Icon name="shield" size={20} /></div>
          <h3>Self-hostable</h3>
          <p>Single binary, SQLite by default. Deploy on any box you trust.</p>
        </div>
        <div className="feature">
          <div className="ic"><Icon name="export" size={20} /></div>
          <h3>Portable</h3>
          <p>
            Export and import JSON. No lock-in, ever.
          </p>
        </div>
        <div className="feature">
          <div className="ic"><Icon name="github" size={20} /></div>
          <h3>Open source</h3>
          <p>
            MIT-licensed and built in public. Fork it, fix it, ship it your
            way.
          </p>
        </div>
      </div>
      <div className="gh-cta">
        <div className="gh-cta-text">
          <strong>Open-source, self-hostable, and built to stay portable.</strong>
          <span>MIT licensed · Exportable JSON · Local hosting</span>
        </div>
        <a className="btn lg" href="#" onClick={(e) => e.preventDefault()}>
          <Icon name="github" size={16} /> Star on GitHub
        </a>
      </div>
    </section>
  )
}
