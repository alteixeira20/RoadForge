import type { Metadata } from 'next'
import Link from 'next/link'
import { Brand } from '@/components/ui/Brand'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { ProblemReportLink } from '@/components/ui/ProblemReportLink'
import './help.css'

export const metadata: Metadata = {
  title: 'Help · RoadForge',
  description: 'Task-based help for local roadmaps, collaboration, recovery, and portable backups.',
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
          <p className="help-eyebrow">RoadForge user guide</p>
          <h1>Plan locally. Collaborate only when you choose.</h1>
          <p>
            Start with a roadmap stored in this browser, keep portable backups,
            and save to a server only when you need sharing and realtime work.
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
              Choose <strong>Start blank</strong> for one fresh Planning phase,
              or <strong>Use RoadForge template</strong> for an independent copy
              of the bundled Clean Beta roadmap. Your edits never change the
              source template.
            </p>
            <p>
              Local roadmaps are stored in browser local storage. They work
              offline, but clearing site data or changing browsers can remove
              them, so export JSON backups regularly.
            </p>
          </section>

          <section id="plan">
            <h2>Create phases and tasks</h2>
            <p>
              Use <strong>Add phase</strong> in the roadmap toolbar, then name
              the phase. Inside an empty phase, choose <strong>Add first task</strong>.
              Phase menus contain rename, color, and delete actions.
            </p>
            <p>
              RoadForge highlights exactly one recommended <strong>Next</strong>
              task when the roadmap defines one. Dependencies can leave other
              tasks blocked; completing prerequisites makes the sequence easier
              to follow. Search and filters change what is visible, not the saved
              roadmap.
            </p>
          </section>

          <section id="portable">
            <h2>Import and export</h2>
            <p>
              Open <strong>Import / Export</strong> from the workspace header.
              JSON is the portable, re-importable backup format. Markdown is a
              readable snapshot and cannot be imported.
            </p>
            <p>
              Import validates and repairs supported historical formats before
              showing a preview. You can create a new local roadmap, add safe
              unmatched items, or replace the current roadmap after a checkpoint.
              Session tokens, invite credentials, passwords, and edit locks are
              never part of exports.
            </p>
          </section>

          <section id="collaborate">
            <h2>Save and share</h2>
            <p>
              <strong>Save</strong> creates a server-backed copy and enables
              optional collaboration. Owner and editor links are credentials:
              share them privately. Viewer access is read-only.
            </p>
            <ul>
              <li><strong>Owner:</strong> edit, restore versions, manage links, participants, and claim overrides.</li>
              <li><strong>Editor:</strong> edit roadmap content and use ordinary claims, without owner-only controls.</li>
              <li><strong>Viewer:</strong> read roadmap, activity, and visible lock state without mutation controls.</li>
            </ul>
            <p>
              Opening an editor or phase color control acquires a short edit
              lock. A task claim says who is working on it; owners can explicitly
              override another participant after confirmation.
            </p>
          </section>

          <section id="recover">
            <h2>Resolve save and conflict states</h2>
            <p>
              <strong>Saving</strong> means a request is in flight,
              <strong>Synced</strong> means the server accepted it, and
              <strong>Offline</strong> means RoadForge could not reach the API.
              Your local draft remains available.
            </p>
            <p>
              When another participant saved first, review the conflict before
              choosing to keep editing locally, retry your local version against
              the latest server timestamp, or confirm a server reload. A reload
              is the only option that discards the local draft.
            </p>
          </section>

          <section id="history">
            <h2>Use activity and versions</h2>
            <p>
              Activity records meaningful attributed actions for a saved
              roadmap. Versions are restore points available to owners and
              editors for inspection; only owners can restore. Restoring creates
              another version and notifies collaborators.
            </p>
          </section>

          <section id="troubleshoot">
            <h2>Troubleshoot safely</h2>
            <ul>
              <li>If a local roadmap is missing, use the roadmap switcher and check whether browser site data was cleared.</li>
              <li>If sync is offline, keep the local draft, verify the API is reachable, then use Retry.</li>
              <li>If a session expired or was revoked, keep the local cache and rejoin through a current invite link.</li>
              <li>If an import fails, keep the original file unchanged and review the validation message before repairing it.</li>
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
              <li>Local browser storage is not a substitute for an exported backup.</li>
              <li>Markdown export is presentation-only; PDF export is not available.</li>
              <li>Conflict recovery does not provide automatic three-way merging.</li>
              <li>Memory-mode realtime supports one API worker; multiple workers require Redis.</li>
              <li>RoadForge has no accounts, OAuth, external REST API v1, webhooks, billing, or telemetry.</li>
            </ul>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
