export type MarkdownInline =
  | { type: 'text'; value: string }
  | { type: 'strong'; value: string }
  | { type: 'emphasis'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; label: string; href: string | null }

export interface MarkdownListItem {
  checked?: boolean
  content: MarkdownInline[]
}

export type MarkdownBlock =
  | { type: 'paragraph'; content: MarkdownInline[] }
  | { type: 'list'; ordered: boolean; items: MarkdownListItem[] }

const INLINE_PATTERN =
  /(`[^`\n]+`|\[[^\]\n]+\]\([^\s)\n]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g

export function sanitizeMarkdownHref(href: string): string | null {
  const value = href.trim()
  if (/^(https?:|mailto:)/i.test(value)) return value
  if (/^(\/|\.\/|\.\.\/|#|\?)/.test(value)) return value
  return null
}

export function parseMarkdownInline(value: string): MarkdownInline[] {
  const tokens: MarkdownInline[] = []
  let cursor = 0

  for (const match of value.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0
    if (index > cursor) tokens.push({ type: 'text', value: value.slice(cursor, index) })
    tokens.push(parseInlineMatch(match[0]))
    cursor = index + match[0].length
  }

  if (cursor < value.length) tokens.push({ type: 'text', value: value.slice(cursor) })
  return tokens
}

function parseInlineMatch(value: string): MarkdownInline {
  if (value.startsWith('`')) {
    return { type: 'code', value: value.slice(1, -1) }
  }
  if (value.startsWith('[')) {
    const splitAt = value.lastIndexOf('](')
    const label = value.slice(1, splitAt)
    const href = value.slice(splitAt + 2, -1)
    return { type: 'link', label, href: sanitizeMarkdownHref(href) }
  }
  if (value.startsWith('**') || value.startsWith('__')) {
    return { type: 'strong', value: value.slice(2, -2) }
  }
  return { type: 'emphasis', value: value.slice(1, -1) }
}

export function parseMarkdownDescription(value: string): MarkdownBlock[] {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1
      continue
    }

    const list = parseList(lines, index)
    if (list) {
      blocks.push(list.block)
      index = list.nextIndex
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length && lines[index].trim() && !matchListItem(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push({ type: 'paragraph', content: parseMarkdownInline(paragraph.join('\n')) })
  }

  return blocks
}

interface ListMatch {
  ordered: boolean
  checked?: boolean
  value: string
}

function matchListItem(line: string): ListMatch | null {
  const task = line.match(/^\s*[-+*]\s+\[([ xX])\]\s+(.+)$/)
  if (task) {
    return { ordered: false, checked: task[1].toLowerCase() === 'x', value: task[2] }
  }
  const unordered = line.match(/^\s*[-+*]\s+(.+)$/)
  if (unordered) return { ordered: false, value: unordered[1] }
  const ordered = line.match(/^\s*\d+\.\s+(.+)$/)
  if (ordered) return { ordered: true, value: ordered[1] }
  return null
}

function parseList(
  lines: string[],
  startIndex: number,
): { block: MarkdownBlock; nextIndex: number } | null {
  const first = matchListItem(lines[startIndex])
  if (!first) return null

  const items: MarkdownListItem[] = []
  let index = startIndex
  while (index < lines.length) {
    const item = matchListItem(lines[index])
    if (!item || item.ordered !== first.ordered) break
    items.push({
      ...(item.checked !== undefined ? { checked: item.checked } : {}),
      content: parseMarkdownInline(item.value),
    })
    index += 1
  }

  return { block: { type: 'list', ordered: first.ordered, items }, nextIndex: index }
}
