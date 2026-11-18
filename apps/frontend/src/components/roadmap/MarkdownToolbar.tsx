import type { RefObject } from 'react'

interface MarkdownToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (value: string) => void
}

type MarkdownAction =
  | { label: string; title: string; kind: 'wrap'; before: string; after: string; fallback: string }
  | { label: string; title: string; kind: 'prefix'; prefix: string }
  | { label: string; title: string; kind: 'numbered' }

const ACTIONS: MarkdownAction[] = [
  { label: 'B', title: 'Bold', kind: 'wrap', before: '**', after: '**', fallback: 'bold text' },
  { label: 'I', title: 'Italic', kind: 'wrap', before: '*', after: '*', fallback: 'italic text' },
  { label: '<>', title: 'Inline code', kind: 'wrap', before: '`', after: '`', fallback: 'code' },
  { label: '•', title: 'Bullet list', kind: 'prefix', prefix: '- ' },
  { label: '1.', title: 'Numbered list', kind: 'numbered' },
  { label: '☐', title: 'Task checkbox', kind: 'prefix', prefix: '- [ ] ' },
  { label: '↗', title: 'Link', kind: 'wrap', before: '[', after: '](https://)', fallback: 'link text' },
]

function applyAction(value: string, start: number, end: number, action: MarkdownAction) {
  const selected = value.slice(start, end)
  if (action.kind === 'wrap') {
    const content = selected || action.fallback
    const replacement = `${action.before}${content}${action.after}`
    return {
      value: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
      start: start + action.before.length,
      end: start + action.before.length + content.length,
    }
  }

  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEndMatch = value.indexOf('\n', end)
  const lineEnd = lineEndMatch === -1 ? value.length : lineEndMatch
  const lines = value.slice(lineStart, lineEnd).split('\n')
  const replacement = lines.map((line, index) => (
    action.kind === 'numbered' ? `${index + 1}. ${line}` : `${action.prefix}${line}`
  )).join('\n')
  return {
    value: `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
    start: lineStart,
    end: lineStart + replacement.length,
  }
}

export function MarkdownToolbar({ textareaRef, value, onChange }: MarkdownToolbarProps) {
  const handleAction = (action: MarkdownAction) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const result = applyAction(value, textarea.selectionStart, textarea.selectionEnd, action)
    onChange(result.value)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(result.start, result.end)
    })
  }

  return (
    <div className="markdown-toolbar" role="toolbar" aria-label="Description formatting">
      {ACTIONS.map((action) => (
        <button
          key={action.title}
          type="button"
          title={action.title}
          aria-label={action.title}
          onClick={() => handleAction(action)}
        >
          {action.label}
        </button>
      ))}
      <span>Markdown</span>
    </div>
  )
}
