export interface InviteTokenLocation {
  hash: string
  search: string
}

/**
 * Read a RoadForge invite credential without sending new credentials in the
 * request target. Fragment credentials are canonical; query credentials are
 * accepted only so pre-hardening links can still be exchanged.
 */
export function readInviteToken(location: InviteTokenLocation): string | null {
  const fragment = location.hash.startsWith('#')
    ? location.hash.slice(1)
    : location.hash
  const fragmentToken = new URLSearchParams(fragment).get('token')?.trim()
  if (fragmentToken) return fragmentToken

  const legacyQueryToken = new URLSearchParams(location.search).get('token')?.trim()
  return legacyQueryToken || null
}

/**
 * Remove invite credentials from the visible URL/history entry after they have
 * been copied into component memory. Preserve unrelated query/fragment state.
 */
export function scrubInviteTokenFromAddressBar(): void {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  url.searchParams.delete('token')

  const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  const fragmentParams = new URLSearchParams(fragment)
  fragmentParams.delete('token')
  const remainingFragment = fragmentParams.toString()

  const cleanUrl = `${url.pathname}${url.search}${remainingFragment ? `#${remainingFragment}` : ''}`
  window.history.replaceState(window.history.state, '', cleanUrl)
}
