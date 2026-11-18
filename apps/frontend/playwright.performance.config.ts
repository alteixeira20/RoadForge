import { defineConfig } from '@playwright/test'

const port = Number(process.env.PLAYWRIGHT_PERFORMANCE_PORT ?? 4174)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/performance',
  testMatch: '**/*.performance.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `corepack pnpm build && node scripts/serve-standalone.mjs`,
    env: { PORT: String(port), HOSTNAME: '127.0.0.1' },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
