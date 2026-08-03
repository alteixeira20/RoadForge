import type { Metadata } from 'next'
import Link from 'next/link'
import { Brand } from '@/components/ui/Brand'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { ProblemReportLink } from '@/components/ui/ProblemReportLink'
import './help.css'

export const metadata: Metadata = {
  title: 'Help · RoadForge',
  description: 'A practical guide to local roadmaps, sharing, backups, and recovery.',
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
          <h1>Plan locally. Share only when you choose.</h1>
          <p>
            Start in this browser, export portable backups, and enable server
            sync only when you need collaboration.
          </p>
        </div>

        <nav className="help-toc" aria-label="Guide topics">
          <a href="#start">Start a roadmap</a>
          <a href="#plan">Create phases and tasks</a>
          <a href="#portable">Import and export</a>
          <a href="#collaborate">Save and share</a>
          <a href="#recover">Resolve conflicts</a>
          <a href="#history">Activity and versions</a>
          <a href="#troubleshoot">Troubleshoot</a>
          <a href="#limits">Known limitations</a>
        </nav>

        <div className="help-sections">
          <section id="start">
            <h2>Start a roadmap</h2>
            <p>
              Choose <strong>Blank roadmap</strong> for one empty Planning phase,
              or <strong>Starter example</strong> for three phases and nine tasks
              that demonstrate progress, focus, and dependencies. Everything is
              editable.
            </p>
            <p>
              Local roadmaps are stored in browser local storage and work
              offline. Clearing site data or changing browsers can remove them,
              so keep a JSON backup of anything important.
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
              RoadForge can highlight one recommended <strong>Next</strong> task.
              Dependencies mark work as blocked until its prerequisites are done.
              Search and filters only change the current view; they never remove
              roadmap data.
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

          <section id="collaborate">
            <h2>Save and share</h2>
            <p>
              <strong>Save</strong> creates a server-backed copy and enables
              sharing. Owner and editor links are credentials, so send them
              privately. Viewer links are read-only.
            </p>
            <ul>
              <li><strong>Owner:</strong> edit, restore versions, manage links and participants, and override claims.</li>
              <li><strong>Editor:</strong> edit roadmap content and claim tasks.</li>
              <li><strong>Viewer:</strong> read the roadmap and activity without changing anything.</li>
            </ul>
            <p>
              An edit lock prevents two people from changing the same control at
              once. A task claim communicates who is working on a task; it does
              not assign permanent ownership.
            </p>
          </section>

          <section id="recover">
            <h2>Resolve save and conflict states</h2>
            <p>
              <strong>Saving</strong> means a request is in progress,
              <strong>Synced</strong> means the server accepted it, and
              <strong>Offline</strong> means RoadForge could not reach the server.
              Your browser copy remains available.
            </p>
            <p>
              A conflict means somebody saved a newer version first. Review the
              differences, then choose whether to keep your local version or load
              the server version. Loading the server version discards the local
              draft only after confirmation.
            </p>
          </section>

          <section id="history">
            <h2>Use activity and versions</h2>
            <p>
              Activity shows meaningful actions on a shared roadmap. Versions are
              explicit restore points. Owners and editors can inspect them; only
              owners can restore one. A restore creates a new restore point rather
              than deleting later history.
            </p>
          </section>

          <section id="troubleshoot">
            <h2>Troubleshoot safely</h2>
            <ul>
              <li>If a local roadmap is missing, open the roadmap switcher and check whether browser site data was cleared.</li>
              <li>If sync is offline, keep working locally and retry after the server is reachable.</li>
              <li>If a session expired or was revoked, keep the local copy and rejoin through a current invite link.</li>
              <li>If an import fails, leave the original file unchanged and use the validation message to repair a copy.</li>
            </ul>
            <p>
              Need help?{' '}
              <ProblemReportLink />
              . Do not include invite links, tokens, private roadmap exports,
              secrets, or private logs in a public issue.
            </p>
          </section>

          <section id="limits">
            <h2>Known limitations</h2>
            <ul>
              <li>Browser storage is not a substitute for an exported backup.</li>
              <li>Markdown is presentation-only and PDF export is not available.</li>
              <li>Conflicts require a deliberate choice; RoadForge does not silently merge competing edits.</li>
              <li>Accountless sharing identifies access credentials and display names, not verified personal identities.</li>
            </ul>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
