export function resolveTeamFeaturesEnabled(value: string | undefined): boolean {
  return value === 'true'
}

export const TEAM_FEATURES_ENABLED = resolveTeamFeaturesEnabled(
  process.env.NEXT_PUBLIC_TEAM_FEATURES_ENABLED,
)

export function teamFeaturesEnabled(): boolean {
  return TEAM_FEATURES_ENABLED
}
