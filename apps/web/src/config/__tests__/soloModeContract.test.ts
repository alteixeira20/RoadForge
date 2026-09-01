import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveTeamFeaturesEnabled } from '@/config/capabilities'

const repoRoot = resolve(process.cwd(), '../..')
const readRepo = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('solo-mode capability contract', () => {
  it('defaults team features off and only enables them explicitly', () => {
    expect(resolveTeamFeaturesEnabled(undefined)).toBe(false)
    expect(resolveTeamFeaturesEnabled('')).toBe(false)
    expect(resolveTeamFeaturesEnabled('false')).toBe(false)
    expect(resolveTeamFeaturesEnabled('true')).toBe(true)
  })

  it('keeps realtime credentials disconnected while team features are disabled', () => {
    const source = readRepo('apps/web/src/context/RoadmapContext.tsx')
    expect(source).toContain('serverRoadmapId: TEAM_FEATURES_ENABLED ? serverRoadmapId : null')
    expect(source).toContain('sessionToken: TEAM_FEATURES_ENABLED ? sessionToken : null')
  })

  it('gates edit-lock, participant, and claim networking behind the same capability', () => {
    const editLock = readRepo('apps/web/src/hooks/useEditLock.ts')
    const participants = readRepo('apps/web/src/hooks/useWorkspaceParticipants.ts')
    const claims = readRepo('apps/web/src/hooks/useTaskClaim.ts')

    expect(editLock).toContain('!TEAM_FEATURES_ENABLED')
    expect(editLock).toContain('setInterval(tryRefresh, 20_000)')
    expect(participants).toContain('!TEAM_FEATURES_ENABLED')
    expect(claims).toContain('if (!TEAM_FEATURES_ENABLED')
  })

  it('keeps share UI dormant while import/export stays mounted', () => {
    const modals = readRepo('apps/web/src/components/roadmap/WorkspaceModals.tsx')
    const modalState = readRepo('apps/web/src/hooks/useWorkspaceModals.ts')
    const claims = readRepo('apps/web/src/components/roadmap/task-row/TaskClaimRow.tsx')

    expect(modals).toContain('TEAM_FEATURES_ENABLED && (')
    expect(modals).toContain('<IOModal')
    expect(modalState).toContain('showShare: TEAM_FEATURES_ENABLED && showShare')
    expect(claims).toContain('if (!TEAM_FEATURES_ENABLED) return null')
  })

  it('defines a three-service loopback-only local runtime with no Redis service', () => {
    const compose = readRepo('deploy/local/compose.yaml')

    expect(compose).toContain('roadforge-web:')
    expect(compose).toContain('roadforge-api:')
    expect(compose).toContain('roadforge-postgres:')
    expect(compose).not.toContain('roadforge-redis:')
    expect(compose).not.toMatch(/^\s+redis:\s*$/m)
    expect(compose).toContain('127.0.0.1:3020:3000')
    expect(compose).toContain('127.0.0.1:7878:7878')
    expect(compose).toContain('ROADFORGE_API_WORKERS: "1"')
    expect(compose).toContain('NEXT_PUBLIC_TEAM_FEATURES_ENABLED: "false"')

    const postgresSection = compose.split('roadforge-postgres:')[1]
    expect(postgresSection).toBeTruthy()
    expect(postgresSection).not.toContain('\n    ports:')
  })

  it('describes service backing separately from team sharing', () => {
    const saveModal = readRepo('apps/web/src/components/share/SaveToServerModal.tsx')
    const header = readRepo('apps/web/src/components/layout/AppHeader.tsx')

    expect(saveModal).toContain('API and agent access')
    expect(saveModal).toContain('In progress — available soon')
    expect(saveModal).toContain('Portable JSON')
    expect(header).toContain('Save to service')
    expect(header).toContain('Team sharing is in progress — available soon')
  })
})
