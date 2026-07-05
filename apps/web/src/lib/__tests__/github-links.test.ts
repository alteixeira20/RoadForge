import { describe, expect, it } from 'vitest'
import { parseTaskExternalLinkUrl } from '@/lib/github-links'

describe('parseTaskExternalLinkUrl', () => {
  it.each([
    {
      input: 'https://github.com/anvilary/roadforge/issues/601',
      kind: 'issue',
      detail: { number: 601 },
      url: 'https://github.com/anvilary/roadforge/issues/601',
    },
    {
      input: 'https://github.com/anvilary/roadforge/pull/602/',
      kind: 'pull',
      detail: { number: 602 },
      url: 'https://github.com/anvilary/roadforge/pull/602',
    },
    {
      input: 'https://github.com/anvilary/roadforge/discussions/603',
      kind: 'discussion',
      detail: { number: 603 },
      url: 'https://github.com/anvilary/roadforge/discussions/603',
    },
    {
      input: 'https://github.com/anvilary/roadforge/commit/ABCDEF0123456789',
      kind: 'commit',
      detail: { sha: 'abcdef0123456789' },
      url: 'https://github.com/anvilary/roadforge/commit/abcdef0123456789',
    },
    {
      input: 'https://github.com/anvilary/roadforge/releases/tag/v1.2.3',
      kind: 'release',
      detail: { tag: 'v1.2.3' },
      url: 'https://github.com/anvilary/roadforge/releases/tag/v1.2.3',
    },
  ])('normalizes a GitHub $kind URL', ({ input, kind, detail, url }) => {
    const result = parseTaskExternalLinkUrl(`${input}?view=compact#details`, 'link-1')

    expect(result).toEqual({
      ok: true,
      link: expect.objectContaining({
        id: 'link-1',
        provider: 'github',
        kind,
        owner: 'anvilary',
        repo: 'roadforge',
        url,
        ...detail,
      }),
    })
    if (result.ok) {
      expect(result.link.url).not.toMatch(/[?#]/)
      expect(result.link.url).not.toMatch(/\/$/)
    }
  })

  it('normalizes generic HTTP(S) links without query or fragment data', () => {
    const result = parseTaskExternalLinkUrl(
      'https://docs.example.com/spec/?view=compact#section',
      'spec-link',
      'Specification',
    )

    expect(result).toEqual({
      ok: true,
      link: {
        id: 'spec-link',
        provider: 'url',
        kind: 'url',
        url: 'https://docs.example.com/spec',
        label: 'Specification',
      },
    })
  })

  it('treats unsupported GitHub pages as generic URLs', () => {
    const result = parseTaskExternalLinkUrl(
      'https://github.com/anvilary/roadforge/actions',
      'actions-link',
    )

    expect(result).toEqual({
      ok: true,
      link: {
        id: 'actions-link',
        provider: 'url',
        kind: 'url',
        url: 'https://github.com/anvilary/roadforge/actions',
      },
    })
  })

  it.each([
    {
      input: '',
      code: 'empty',
      message: 'Enter a link URL.',
    },
    {
      input: 'not a URL',
      code: 'invalid_url',
      message: 'Enter a valid URL.',
    },
    {
      input: 'ftp://example.com/file',
      code: 'unsupported_scheme',
      message: 'Only HTTP and HTTPS links are supported.',
    },
    {
      input: 'https://username@example.com/path',
      code: 'credentials_not_allowed',
      message: 'Links must not include a username or password.',
    },
    {
      input: 'https://example.com/path?access_token=redacted',
      code: 'credential_query_not_allowed',
      message: 'Remove credential or token parameters from the URL.',
    },
    {
      input: 'https://github.com/anvilary/roadforge/issues/not-a-number',
      code: 'malformed_github_url',
      message: 'Use a GitHub issue, pull request, discussion, commit, or release URL.',
    },
    {
      input: 'https://github.com/anvilary/roadforge/commit/not-a-sha',
      code: 'malformed_github_url',
      message: 'Use a GitHub issue, pull request, discussion, commit, or release URL.',
    },
  ])('returns $code for "$input"', ({ input, code, message }) => {
    expect(parseTaskExternalLinkUrl(input, 'link-1')).toEqual({
      ok: false,
      error: { code, message },
    })
  })
})
