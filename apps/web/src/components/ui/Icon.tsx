'use client'

export type IconName =
  | 'anvil'
  | 'flame'
  | 'search'
  | 'filter'
  | 'plus'
  | 'x'
  | 'check'
  | 'chevron-right'
  | 'chevron-down'
  | 'moon'
  | 'sun'
  | 'lock'
  | 'cloud'
  | 'device'
  | 'share'
  | 'users'
  | 'user'
  | 'import'
  | 'export'
  | 'link'
  | 'circle'
  | 'circle-check'
  | 'arrow-right'
  | 'github'
  | 'spark'
  | 'shield'
  | 'robot'
  | 'fold'
  | 'activity'
  | 'pencil'
  | 'chevron-up'
  | 'grip'
  | 'eye'
  | 'eye-off'
  | 'trash'
  | 'clock'
  | 'more'

export interface IconProps {
  name: IconName
  size?: number
  stroke?: string
  strokeWidth?: number
}

export function Icon({ name, size = 16, stroke = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  const s = {
    width: size,
    height: size,
    fill: 'none' as const,
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
  }

  switch (name) {
    case 'anvil':
      return (
        <svg {...s}>
          <path d="M3 9h18l-2 4h-3l-2 5H8l-2-5H5L3 9z" />
          <path d="M9 9V6h6v3" />
        </svg>
      )
    case 'flame':
      return (
        <svg {...s}>
          <path d="M12 3c2 3 5 5 5 9a5 5 0 1 1-10 0c0-2 1-3 2-4-.5 2 .5 3 1 3 0-3 1-5 2-8z" />
        </svg>
      )
    case 'search':
      return (
        <svg {...s}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      )
    case 'filter':
      return (
        <svg {...s}>
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...s}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
    case 'x':
      return (
        <svg {...s}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      )
    case 'check':
      return (
        <svg {...s}>
          <path d="M5 12l5 5L20 7" />
        </svg>
      )
    case 'chevron-right':
      return (
        <svg {...s}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      )
    case 'chevron-down':
      return (
        <svg {...s}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      )
    case 'chevron-up':
      return (
        <svg {...s}>
          <path d="m18 15-6-6-6 6" />
        </svg>
      )
    case 'grip':
      return (
        <svg {...s}>
          <circle cx="9" cy="5" r="1" fill="currentColor" stroke="none" />
          <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="9" cy="19" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="5" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="19" r="1" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'moon':
      return (
        <svg {...s}>
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
        </svg>
      )
    case 'sun':
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4" />
        </svg>
      )
    case 'lock':
      return (
        <svg {...s}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 1 1 8 0v3" />
        </svg>
      )
    case 'cloud':
      return (
        <svg {...s}>
          <path d="M7 18a4 4 0 1 1 .7-7.95A6 6 0 0 1 19 12a4 4 0 0 1 0 8H7z" />
        </svg>
      )
    case 'device':
      return (
        <svg {...s}>
          <rect x="3" y="5" width="18" height="12" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      )
    case 'share':
      return (
        <svg {...s}>
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="6" r="2.5" />
          <circle cx="18" cy="18" r="2.5" />
          <path d="m8 11 8-4M8 13l8 4" />
        </svg>
      )
    case 'users':
      return (
        <svg {...s}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M15 20a5 5 0 0 1 6 0" />
        </svg>
      )
    case 'user':
      return (
        <svg {...s}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    case 'import':
      return (
        <svg {...s}>
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
      )
    case 'export':
      return (
        <svg {...s}>
          <path d="M12 21V9M7 14l5-5 5 5M5 3h14" />
        </svg>
      )
    case 'link':
      return (
        <svg {...s}>
          <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
          <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
        </svg>
      )
    case 'circle':
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      )
    case 'circle-check':
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="8" />
          <path d="m8 12 3 3 5-6" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7v5l3 2" />
        </svg>
      )
    case 'arrow-right':
      return (
        <svg {...s}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      )
    case 'github':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={stroke}>
          <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
        </svg>
      )
    case 'spark':
      return (
        <svg {...s}>
          <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
        </svg>
      )
    case 'shield':
      return (
        <svg {...s}>
          <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
        </svg>
      )
    case 'robot':
      return (
        <svg {...s}>
          <rect x="4" y="8" width="16" height="11" rx="2" />
          <path d="M9 14h.01M15 14h.01M12 4v4M9 19v2M15 19v2" />
        </svg>
      )
    case 'fold':
      return (
        <svg {...s}>
          <path d="M4 8l8-5 8 5M4 16l8 5 8-5M9 12h6" />
        </svg>
      )
    case 'activity':
      return (
        <svg {...s}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      )
    case 'pencil':
      return (
        <svg {...s}>
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
      )
    case 'eye':
      return (
        <svg {...s}>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'eye-off':
      return (
        <svg {...s}>
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...s}>
          <path d="M4 7h16" />
          <path d="M10 11v6M14 11v6" />
          <path d="M6 7l1 14h10l1-14" />
          <path d="M9 7V4h6v3" />
        </svg>
      )
    case 'more':
      return (
        <svg {...s}>
          <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      )
    default:
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="6" />
        </svg>
      )
  }
}
