export const ROADFORGE_ISSUE_CHOOSER_URL =
  'https://github.com/alteixeira20/RoadForge/issues/new/choose'

export const PROBLEM_REPORT_PRIVACY_WARNING =
  'Do not include tokens, secrets, private logs, roadmap exports, invite links, sessions, or private URLs.'

interface ProblemReportLinkProps {
  className?: string
}

export function ProblemReportLink({ className }: ProblemReportLinkProps) {
  return (
    <a
      className={className}
      href={ROADFORGE_ISSUE_CHOOSER_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Report a problem with RoadForge on GitHub (opens in a new tab). Privacy warning: ${PROBLEM_REPORT_PRIVACY_WARNING}`}
      title={`Report a problem. ${PROBLEM_REPORT_PRIVACY_WARNING}`}
    >
      <span className="problem-report-link-label">Report a problem</span>
    </a>
  )
}
