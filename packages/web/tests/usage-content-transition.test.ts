import { describe, expect, it } from 'vitest'
import { selectContent, advanceContent, type ContentBlend } from '../src/lib/usage-content-transition'
const a = { key: 'a' }, b = { key: 'b' }, c = { key: 'c' }
describe('bounded interrupted content crossfade', () => {
  it('preserves both layer opacities on a 60ms reversal and same-circle reentry', () => {
    let blend = advanceContent(selectContent(selectContent({ progress: 1 }, a), b), 60)
    const progress = blend.progress
    blend = selectContent(blend, a)
    expect(blend).toEqual({ current: a, previous: b, progress: 1 - progress })
    expect(selectContent(blend, a)).toEqual(blend)
  })
  it('never retains more than two keys during repeated reversals and third-device interruption', () => {
    let blend: ContentBlend<typeof a> = { progress: 1 }
    for (const next of Array.from({ length: 60 }, (_, i) => [a, b, c][i % 3])) {
      blend = advanceContent(selectContent(blend, next), 60)
      expect(new Set([blend.current?.key, blend.previous?.key].filter(Boolean)).size).toBeLessThanOrEqual(2)
      expect(blend.current).toBe(next)
    }
    expect(advanceContent(blend, 160).previous).toBeUndefined()
  })
  it('settles immediately for reduced motion, hiding and close', () => {
    const blend = advanceContent(selectContent(selectContent({ progress: 1 }, a), b), 60)
    expect(selectContent(blend, c, true)).toEqual({ current: c, progress: 1 })
    expect(selectContent(blend, undefined)).toEqual({ current: b, progress: 1 })
  })
})
