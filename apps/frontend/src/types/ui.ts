import type { CSSProperties } from 'react'

// Extends CSSProperties to allow inline CSS custom properties (--variable syntax).
export type ForgeStyle = CSSProperties & { [key: `--${string}`]: string | number }
