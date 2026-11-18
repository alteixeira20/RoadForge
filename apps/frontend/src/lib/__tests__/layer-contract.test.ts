import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const tokensSource = readFileSync(
  resolve(process.cwd(), 'src/styles/tokens.css'),
  'utf8',
)

function layerValue(name: string): number {
  const match = tokensSource.match(new RegExp(`--${name}:\\s*(\\d+);`))
  if (!match) throw new Error(`Missing layer token --${name}`)
  return Number(match[1])
}

describe('overlay layer contract', () => {
  it('keeps chrome, overlays, panels, modals, and toasts ordered', () => {
    const orderedLayers = [
      'z-popover',
      'z-workspace-header',
      'z-header',
      'z-anchored-overlay',
      'z-panel',
      'z-modal',
      'z-toast',
    ].map(layerValue)

    expect(orderedLayers).toEqual([...orderedLayers].sort((a, b) => a - b))
    expect(new Set(orderedLayers).size).toBe(orderedLayers.length)
    expect(layerValue('z-wizard')).toBe(layerValue('z-modal'))
  })
})
