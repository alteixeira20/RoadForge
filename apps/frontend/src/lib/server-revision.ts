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

export function newestServerRevision(
  ...revisions: Array<string | null | undefined>
): string | null {
  let newest: string | null = null
  for (const revision of revisions) {
    if (!revision) continue
    if (isNewerServerRevision(revision, newest)) newest = revision
  }
  return newest
}

export function isOlderServerRevision(
  candidate: string,
  current: string | null,
): boolean {
  return current !== null && isNewerServerRevision(current, candidate)
}
