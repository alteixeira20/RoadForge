import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ember: 'var(--ember)',
        molten: 'var(--molten)',
        copper: 'var(--copper)',
        panel: 'var(--panel)',
        ink: {
          DEFAULT: 'var(--ink)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          4: 'var(--ink-4)',
        },
        surface: {
          DEFAULT: 'var(--bg)',
          2: 'var(--bg-2)',
          3: 'var(--bg-3)',
          inset: 'var(--bg-inset)',
        },
        forge: {
          border: 'var(--border)',
          'border-strong': 'var(--border-strong)',
          'border-faint': 'var(--border-faint)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        display: ['var(--font-display)'],
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        ember: 'var(--shadow-ember)',
      },
    },
  },
  plugins: [],
}

export default config
