'use client'

import Link from 'next/link'
import { Icon } from './Icon'

interface BrandProps {
  href?: string
}

export function Brand({ href }: BrandProps) {
  const inner = (
    <>
      <div className="mark">
        <Icon name="anvil" size={15} stroke="#f5853f" strokeWidth={1.7} />
      </div>
      <span>Roadforge</span>
    </>
  )

  if (href) {
    return <Link href={href} className="brand">{inner}</Link>
  }

  return <div className="brand">{inner}</div>
}
