// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkdownDescription } from '../MarkdownDescription'

let container: HTMLDivElement
let root: Root

function render(value: string) {
  act(() => {
    root.render(<MarkdownDescription value={value} />)
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('MarkdownDescription', () => {
  it('renders the roadmap fixture headings, lists, and bold labels', () => {
    render(`### Objective

Adopt this roadmap as the single coordination source.

### Required output

- An imported RoadForge roadmap.
- A shared working agreement.

### Coordination

- **Owner:** Alexandre, Partner
- **Depends on:** None
- **Completion rule:** Mark done only after validation passes.`)

    expect(container.querySelectorAll('h3')).toHaveLength(3)
    expect(container.querySelector('h3')?.textContent).toBe('Objective')
    expect(container.textContent).not.toContain('###')
    expect(container.querySelectorAll('ul > li')).toHaveLength(5)
    expect(container.querySelector('strong')?.textContent).toBe('Owner:')
  })

  it('renders core Markdown including nested lists and visible single-line breaks', () => {
    render(`# Title

###### Detail

**bold** and *emphasis* with \`code\`
next line

1. first
   - nested
2. second`)

    expect(container.querySelector('h1')?.textContent).toBe('Title')
    expect(container.querySelector('h6')?.textContent).toBe('Detail')
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('em')?.textContent).toBe('emphasis')
    expect(container.querySelector('code')?.textContent).toBe('code')
    expect(container.querySelector('p > br')).not.toBeNull()
    expect(container.querySelector('ol > li > ul > li')?.textContent).toBe('nested')
  })

  it('renders GFM task lists, tables, strikethrough, and automatic links', () => {
    render(`- [ ] open
- [x] done

| Name | State |
| --- | --- |
| One | Ready |

~~old~~ https://example.com`)

    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2)
    expect(container.querySelector('input')?.hasAttribute('disabled')).toBe(true)
    expect(container.querySelector('table th')?.textContent).toBe('Name')
    expect(container.querySelector('del')?.textContent).toBe('old')
    expect(container.querySelector('a[href="https://example.com"]')?.textContent).toBe('https://example.com')
  })

  it('renders blockquotes, fenced code, and horizontal rules', () => {
    render(`> Quoted

\`\`\`ts
const answer = 42
\`\`\`

---`)

    expect(container.querySelector('blockquote')?.textContent).toContain('Quoted')
    expect(container.querySelector('pre > code')?.textContent).toContain('const answer = 42')
    expect(container.querySelector('hr')).not.toBeNull()
  })

  it('splits blank lines into paragraphs without changing authored Markdown', () => {
    const value = 'First paragraph\n\nSecond paragraph'
    render(value)

    expect(container.querySelectorAll('p')).toHaveLength(2)
    expect(value).toBe('First paragraph\n\nSecond paragraph')
  })

  it('keeps raw HTML inert and strips unsafe link protocols', () => {
    const alert = vi.fn()
    vi.stubGlobal('alert', alert)
    render('<script>alert(1)</script><img src=x onerror="alert(2)"><iframe src="https://example.com"></iframe> [bad](javascript:alert(3)) [data](data:text/html,test)')

    expect(alert).not.toHaveBeenCalled()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(container.textContent).toContain('<script>')
    vi.unstubAllGlobals()
  })

  it('keeps safe links clickable and protects external links', () => {
    render('[external](https://example.com) [mail](mailto:test@example.com) [relative](/tasks) [fragment](#details) [query](?tab=notes)')

    const external = container.querySelector('a[href="https://example.com"]')
    expect(external?.getAttribute('target')).toBe('_blank')
    expect(external?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(container.querySelector('a[href="mailto:test@example.com"]')).not.toBeNull()
    expect(container.querySelector('a[href="/tasks"]')).not.toBeNull()
    expect(container.querySelector('a[href="#details"]')).not.toBeNull()
    expect(container.querySelector('a[href="?tab=notes"]')).not.toBeNull()
  })

  it('renders empty and incomplete Markdown safely', () => {
    render('')
    expect(container.querySelector('.markdown-description')?.textContent).toBe('')

    render('### Incomplete **Markdown')
    expect(container.querySelector('h3')?.textContent).toBe('Incomplete **Markdown')
  })
})
