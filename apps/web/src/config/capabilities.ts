export const TEAM_FEATURES_ENABLED =
  process.env.NEXT_PUBLIC_TEAM_FEATURES_ENABLED === 'true'

export function teamFeaturesEnabled(): boolean {
  return TEAM_FEATURES_ENABLED
}
