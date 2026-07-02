import { describe, expect, it } from 'vitest'
import {
  parseMarkdownDescription,
  parseMarkdownInline,
  sanitizeMarkdownHref,
} from '@/lib/markdown-description'

describe('markdown descriptions', () => {
  it('parses paragraphs, inline formatting, and line breaks', () => {
    const blocks = parseMarkdownDescription('Plain **bold** and *italic*\nwith `code`.')

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'paragraph' })
    expect(parseMarkdownInline('**bold** *italic* `code`').map((token) => token.type))
      .toEqual(['strong', 'text', 'emphasis', 'text', 'code'])
  })

  it('parses ordered, unordered, and task lists', () => {
    const blocks = parseMarkdownDescription(
      '- item\n- [ ] open\n- [x] done\n\n1. first\n2. second',
    )

    expect(blocks).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [
          { content: [{ type: 'text', value: 'item' }] },
          { checked: false, content: [{ type: 'text', value: 'open' }] },
          { checked: true, content: [{ type: 'text', value: 'done' }] },
        ],
      },
      {
        type: 'list',
        ordered: true,
        items: [
          { content: [{ type: 'text', value: 'first' }] },
          { content: [{ type: 'text', value: 'second' }] },
        ],
      },
    ])
  })

  it('blocks executable and unknown link protocols', () => {
    expect(sanitizeMarkdownHref('javascript:alert(1)')).toBeNull()
    expect(sanitizeMarkdownHref('data:text/html,test')).toBeNull()
    expect(sanitizeMarkdownHref('https://example.com')).toBe('https://example.com')
    expect(sanitizeMarkdownHref('/docs')).toBe('/docs')
  })

  it('keeps raw HTML as text tokens', () => {
    expect(parseMarkdownInline('<script>alert(1)</script>')).toEqual([
      { type: 'text', value: '<script>alert(1)</script>' },
    ])
  })
})
