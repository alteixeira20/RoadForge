# Browser Smoke Automation Candidate

## Public Alpha recommendation

Do not add Playwright before Public Alpha. RoadForge has no browser automation
dependency or CI job today, and introducing a browser runtime during the final
alpha QA window would expand release scope without replacing the multi-session,
Redis, deployment, and recovery checks that still require operator observation.

[Manual QA](../manual-qa.md) remains the authoritative browser gate for Public
Alpha. In particular, release QA must cover owner/editor/viewer roles, task edit
locks and idle draft preservation, import/replace checkpoints, version
permissions and restore, and realtime behavior across two browser sessions.

## First automation slice after alpha

When browser automation is scheduled, start with these five smoke tests:

1. Owner creates a roadmap, saves it, generates an editor link, and reloads the
   persisted roadmap.
2. Editor joins from a separate browser context, edits a task, and the owner
   observes the realtime update.
3. Viewer joins from a separate context and cannot edit, claim, save, share, or
   restore.
4. Owner exports JSON, replaces the roadmap from that export, and verifies the
   pre-replacement checkpoint plus preserved roadmap identity.
5. Owner reads and restores a version while editor read-only access works and
   viewer access remains denied.

Keep a separate two-session lock/realtime smoke in the suite once the basic
fixtures are reliable: one editor holds a task lock, the other sees it, idle
pause preserves the draft, and explicit resume reacquires before save.

## Non-brittle test boundary

- Assert roles, persisted data, enabled/disabled actions, URLs, and API-visible
  outcomes; do not compare screenshots or animation timing.
- Use stable accessible names and add test IDs only where no durable semantic
  selector exists.
- Create isolated roadmap data through supported product/API flows and clean it
  up without sharing state between tests.
- Wait on observable responses or UI state, not fixed sleeps. Use bounded
  polling only for SSE propagation and lock expiry.
- Keep deployment preflight, Redis failure/recovery, backup restore, responsive
  review, and broad accessibility checks manual.

Reconsider the no-go after Public Alpha when the dependency, browser cache, CI
runtime, test data lifecycle, and multi-context execution can be added as one
explicitly scoped infrastructure change.
