// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  readInviteToken,
  scrubInviteTokenFromAddressBar,
} from '@/lib/invite-token'

describe('invite-token', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/join')
  })

  it('prefers fragment credentials and never requires a query credential', () => {
    expect(readInviteToken({
      hash: '#token=ow_fragment',
      search: '?token=ow_legacy',
    })).toBe('ow_fragment')
  })

  it('accepts a legacy query credential for migration compatibility', () => {
    expect(readInviteToken({
      hash: '',
      search: '?token=ed_legacy',
    })).toBe('ed_legacy')
  })

  it('scrubs invite credentials from the current history entry', () => {
    window.history.replaceState(
      { test: true },
      '',
      '/join?token=ed_legacy&from=docs#token=ed_fragment&tab=invite',
    )

    scrubInviteTokenFromAddressBar()

    expect(window.location.pathname).toBe('/join')
    expect(window.location.search).toBe('?from=docs')
    expect(window.location.hash).toBe('#tab=invite')
  })
})
