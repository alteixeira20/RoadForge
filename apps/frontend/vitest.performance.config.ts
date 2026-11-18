import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tests/performance/**/*.test.ts',
      'src/hooks/__tests__/useIdleEditPause.test.ts',
      'src/hooks/__tests__/useAutoSync.test.tsx',
      'src/hooks/__tests__/useRoadmapRealtime.test.tsx',
      'src/components/roadmap/__tests__/PhaseListRenderIsolation.test.tsx',
    ],
    setupFiles: ['./vitest.setup.ts'],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
})
