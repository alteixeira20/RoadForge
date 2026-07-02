import { Fragment, type ReactNode } from 'react'
import {
  parseMarkdownDescription,
  type MarkdownInline,
  type MarkdownListItem,
} from '@/lib/markdown-description'

interface MarkdownDescriptionProps {
  value: string
}

function renderInline(tokens: MarkdownInline[]): ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${token.type}-${index}`
    if (token.type === 'strong') return <strong key={key}>{token.value}</strong>
    if (token.type === 'emphasis') return <em key={key}>{token.value}</em>
    if (token.type === 'code') return <code key={key}>{token.value}</code>
    if (token.type === 'link') {
      if (!token.href) return <Fragment key={key}>{token.label}</Fragment>
      const external = /^https?:/i.test(token.href)
      return (
        <a
          key={key}
          href={token.href}
          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {token.label}
        </a>
      )
    }
    return token.value.split('\n').map((line, lineIndex) => (
      <Fragment key={`${key}-${lineIndex}`}>
        {lineIndex > 0 && <br />}
        {line}
      </Fragment>
    ))
  })
}

function renderListItem(item: MarkdownListItem, index: number) {
  return (
    <li key={index} className={item.checked !== undefined ? 'task-list-item' : undefined}>
      {item.checked !== undefined && (
        <input
          type="checkbox"
          checked={item.checked}
          readOnly
          tabIndex={-1}
          aria-label={item.checked ? 'Completed item' : 'Incomplete item'}
        />
      )}
      <span>{renderInline(item.content)}</span>
    </li>
  )
}

export function MarkdownDescription({ value }: MarkdownDescriptionProps) {
  const blocks = parseMarkdownDescription(value)

  return (
    <div className="desc markdown-description">
      {blocks.map((block, index) => {
        if (block.type === 'paragraph') {
          return <p key={index}>{renderInline(block.content)}</p>
        }
        const List = block.ordered ? 'ol' : 'ul'
        return <List key={index}>{block.items.map(renderListItem)}</List>
      })}
    </div>
  )
}
