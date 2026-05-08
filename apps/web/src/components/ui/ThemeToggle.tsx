'use client'

import { Icon } from './Icon'
import { useTheme } from '@/context/ThemeContext'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="theme-toggle">
      <button
        className={theme === 'dark' ? 'active' : ''}
        onClick={() => setTheme('dark')}
        title="Dark"
      >
        <Icon name="moon" size={14} />
      </button>
      <button
        className={theme === 'light' ? 'active' : ''}
        onClick={() => setTheme('light')}
        title="Light"
      >
        <Icon name="sun" size={14} />
      </button>
    </div>
  )
}
