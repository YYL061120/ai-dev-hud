import { describe, expect, it } from 'vitest'
import { getHudBounds } from '../src/hud-window'

describe('right-edge HUD positioning', () => {
  it('keeps the right edge fixed and expands left on an offset monitor', () => {
    const area = { x: 2560, y: 0, width: 1080, height: 1872 }
    const collapsed = getHudBounds(area, false)
    const expanded = getHudBounds(area, true)
    expect(collapsed.width).toBe(56)
    expect(collapsed.x + collapsed.width).toBe(3640)
    expect(expanded.x + expanded.width).toBe(3640)
    expect(expanded.x).toBeLessThan(collapsed.x)
    expect(expanded.y).toBeGreaterThanOrEqual(area.y)
    expect(expanded.y + expanded.height).toBeLessThanOrEqual(area.y + area.height)
  })
  it('supports negative monitor coordinates and does not multiply DIP by DPI', () => {
    expect(getHudBounds({ x: -1920, y: -200, width: 1920, height: 1040 }, false)).toEqual({ x: -56, y: 212, width: 56, height: 216 })
  })
  it('fits inside a small work area', () => {
    expect(getHudBounds({ x: 10, y: 20, width: 200, height: 300 }, true)).toEqual({ x: 10, y: 20, width: 200, height: 300 })
  })
})
