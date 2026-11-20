'use client'

import Image from 'next/image'
import Link from 'next/link'

interface BrandProps {
  href?: string
  className?: string
  logoSize?: number
  size?: 'md' | 'lg'
}

export function Brand({
  href,
  className = 'brand',
  logoSize,
  size = 'md',
}: BrandProps) {
  const isLg = size === 'lg'
  const computedLogoSize = logoSize ?? (isLg ? 80 : 28)
  const combinedClassName = [className, isLg ? 'brand-lg' : '']
    .filter(Boolean)
    .join(' ')

  const inner = (
    <>
      <span className="brand-logo" aria-hidden="true">
        <Image
          className="brand-logo-img"
          src="/brand/roadforge/logo.png"
          alt=""
          width={computedLogoSize}
          height={computedLogoSize}
          priority={isLg}
        />
      </span>
      <span className="brand-text">
        <span className="brand-name">RoadForge</span>
      </span>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={combinedClassName}>
        {inner}
      </Link>
    )
  }

  return <div className={combinedClassName}>{inner}</div>
}
