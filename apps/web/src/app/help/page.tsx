import type { Metadata } from 'next'
import Link from 'next/link'
import { Brand } from '@/components/ui/Brand'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { ProblemReportLink } from '@/components/ui/ProblemReportLink'
import './help.css'

export const metadata: Metadata = {
  title: 'Help · RoadForge',
  description: 'A practical guide to local roadmaps, portable backups, local service backing, self-hosting, and recovery.',
}

export default function HelpPage() {
  return (
    <div className="help-shell">
      <header className="help-topbar">
        <Brand href="/" />
        <nav aria-label="Help navigation">
          <Link href="/">Home</Link>
          <Link href="/workspace">Workspace</Link>
        </nav>
      </header>

      <main className="help-main">
        <div className="help-hero">
          <p className="help-eyebrow">RoadForge guide</p>
          <h1>Plan locally. Add service backing only when useful.</h1>
          <p>
            Start in this browser, export portable backups, and optionally save
            to a RoadForge service when you need durable API or coding-agent access.
            Team sharing is in progress — available soon. This public server is a
            hosted demo; long-running use should run on infrastructure you control.
          </p>
        </div>

        <nav className="help-toc" aria-label="Guide topics">
          <a href="#start">Start a roadmap</a>
          <a href="#plan">Create phases and tasks</a>
          <a href="#portable">Import and export</a>
          <a href="#service">Local service backing</a>
          <a href="#collaborate">Team sharing status</a>
          <a href="#deployment">Demo or self-host</a>
          <a href="#recover">Resolve save conflicts</a>
          <a href="#troubleshoot">Troubleshoot</a>
          <a href="#limits">Known limitations</a>
        </nav>

        <div className="help-sections">
          <section id="start">
            <h2>Start a roadmap</h2>
            <p>
              Choose <strong>Blank roadmap</strong> for one empty Planning phase,
              or <strong>Starter example</strong> for a ready-made roadmap that
              demonstrates progress, focus, and dependencies. Everything is editable.
            </p>
            <p>
              Local roadmaps are stored in browser local storage and work offline.
              Clearing site data or changing browsers can remove them, so keep a
              JSON backup of anything important.
            </p>
          </section>

          <section id="plan">
            <h2>Create phases and tasks</h2>
            <p>
              Add phases from the roadmap toolbar. Add tasks inside each phase,
              then use task details for descriptions, estimates, assignees, tags,
              dependencies, and links.
            </p>
            <p>
              RoadForge can highlight one or more <strong>Recommended</strong> tasks.
              Recommendations are guidance, not a decision about what you must do
              next. Search and filters only change the current view; they never
              remove roadmap data.
            </p>
          </section>

          <section id="portable">
            <h2>Import and export</h2>
            <p>
              Open <strong>Import / Export</strong> from the workspace header.
              JSON is the portable backup format and can be imported again.
              Markdown is a readable snapshot for people and agents.
            </p>
            <p>
              RoadForge validates an import and shows a preview before changing
              anything. You can create a separate local roadmap, add safe new
              items, or replace the current roadmap. Session tokens, invite
              credentials, passwords, and edit locks are never exported.
            </p>
          </section>

          <section id="service">
            <h2>Back a roadmap with the RoadForge service</h2>
            <p>
              <strong>Save to service</strong> creates a server-backed copy without
              enabling team sharing. This is useful for durable machine-local
              persistence, direct API access, and the RoadForge MCP integration.
              Browser-local editing and portable JSON remain available either way.
            </p>
            <p>
              In the lean local runtime, the web UI is bound to <code>127.0.0.1:3020</code>,
              the API to <code>127.0.0.1:7878</code>, and Postgres stays internal to
              the runtime. Team/realtime frontend networking is disabled.
            </p>
          </section>

          <section id="collaborate">
            <h2>Team sharing</h2>
            <p>
              Team sharing and live coordination are <strong>in progress — available soon</strong>.
              Share links, participant presence, edit-lock networking, realtime updates,
              and task claim controls are intentionally dormant in the current product surface.
            </p>
            <p>
              The retained collaboration model uses owner, editor, and viewer roles.
              Owner, editor, and viewer links are access credentials and are not public publishing links.
              When these capabilities return, they should be treated as private bearer credentials.
            </p>
          </section>

          <section id="deployment">
            <h2>Use the demo or self-host</h2>
            <p>
              The Anvilary-hosted RoadForge instance is a hosted demo/reference
              deployment. It is not a managed team SaaS, durable backup service,
              or large-team production service. There is no hosted SLA, reserved
              capacity, or guaranteed data-recovery service.
            </p>
            <p>
              For long-running or operationally important use, fork the repository
              or maintain a controlled clone and self-host it. If RoadForge later
              becomes part of a larger team workflow, the operator should own
              PostgreSQL backups and restores, monitoring, capacity, upgrades,
              security configuration, and incident response.
            </p>
            <p>
              Forking and self-hosting remain subject to the repository&apos;s current
              PolyForm Noncommercial License 1.0.0; the current license does not
              grant commercial use.
            </p>
          </section>

          <section id="recover">
            <h2>Resolve save and conflict states</h2>
            <p>
              <strong>Saving</strong> means a service request is in progress,
              <strong>Synced</strong> means the service accepted it, and
              <strong>Offline</strong> means RoadForge could not reach the service.
              Your browser copy remains available.
            </p>
            <p>
              A conflict means the service has a newer version. Review the
              differences, then choose whether to keep your local version or load
              the service version. Loading it discards the local draft only after confirmation.
            </p>
          </section>

          <section id="troubleshoot">
            <h2>Troubleshoot safely</h2>
            <ul>
              <li>If a local roadmap is missing, open the roadmap switcher and check whether browser site data was cleared.</li>
              <li>If service saving is offline, keep working locally and retry after the API is reachable.</li>
              <li>If an import fails, leave the original file unchanged and use the validation message to repair a copy.</li>
              <li>For the local runtime, run <code>sh deploy/local/roadforge-local.sh doctor</code> and inspect service health before changing state.</li>
            </ul>
            <p>
              Need help?{' '}
              <ProblemReportLink />
              . Do not include invite links, tokens or session credentials, private roadmap exports,
              secrets, or private logs in a public issue.
            </p>
          </section>

          <section id="limits">
            <h2>Known limitations</h2>
            <ul>
              <li>Browser storage is not a substitute for an exported backup.</li>
              <li>Team sharing and live coordination are currently unavailable.</li>
              <li>The public hosted instance is a demo/reference deployment with no uptime, capacity, or recovery SLA.</li>
              <li>Markdown is presentation-only and PDF export is not available.</li>
              <li>Conflicts require a deliberate choice; RoadForge does not silently merge competing edits.</li>
            </ul>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
