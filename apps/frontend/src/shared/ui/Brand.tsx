'use client'

import Image from 'next/image'
import Link from 'next/link'

interface BrandProps {
  href?: string
  className?: string
}

export function Brand({ href, className = 'brand' }: BrandProps) {
  const inner = (
    <>
      <span className="brand-logo" aria-hidden="true">
        <Image
          className="brand-logo-img"
          src="/brand/roadforge/logo.png"
          alt=""
          width={28}
          height={28}
          priority
        />
      </span>
      <span>RoadForge</span>
    </>
  )

  if (href) {
    return <Link href={href} className={className}>{inner}</Link>
  }

  return <div className={className}>{inner}</div>
}
