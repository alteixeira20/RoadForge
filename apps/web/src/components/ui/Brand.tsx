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
          className="brand-logo-default"
          src="/brand/anvilary-logo-mark-tight.png"
          alt=""
          width={24}
          height={28}
        />
        <Image
          className="brand-logo-white"
          src="/brand/anvilary-logo-mark-tight-white.png"
          alt=""
          width={24}
          height={28}
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
