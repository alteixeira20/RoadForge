'use client'

import type { CSSProperties } from 'react'
import { resolveTagColor, resolveTagDisplay } from '@/lib/tag-registry'
import type { TagDefinition } from '@/types/roadmap'

interface TagChipProps {
  tagId: string
  registry: TagDefinition[]
  className?: string
}

export function TagChip({ tagId, registry, className = '' }: TagChipProps) {
  const display = resolveTagDisplay(tagId, registry)
  const color = resolveTagColor(tagId, registry)

  return (
    <span
      className={`tag-chip${className ? ` ${className}` : ''}`}
      style={{ '--tag-color': color } as CSSProperties}
      title={display.label}
    >
      {display.label}
    </span>
  )
}
