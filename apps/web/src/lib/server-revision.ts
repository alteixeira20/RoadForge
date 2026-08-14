export function isNewerServerRevision(
  candidate: string,
  current: string | null,
): boolean {
  if (!current) return true

  const candidateTime = Date.parse(candidate)
  const currentTime = Date.parse(current)
  if (Number.isFinite(candidateTime) && Number.isFinite(currentTime)) {
    return candidateTime > currentTime
  }

  return candidate > current
}
