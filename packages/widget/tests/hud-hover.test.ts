import { describe, expect, it } from 'vitest'
import { HudHoverController, HUD_ENTER_DELAY_MS, HUD_LEAVE_DELAY_MS } from '../src/hud-hover'

const bounds = { x: 2504, y: 588, width: 56, height: 216 }
const edge = { x: 2559, y: 650 }, panel = { x: 2530, y: 650 }, away = { x: 2000, y: 650 }
function reveal(controller: HudHoverController) {
  controller.step(0, edge, bounds)
  controller.step(HUD_ENTER_DELAY_MS, edge, bounds)
  return controller.step(700, edge, bounds)
}

describe('HUD edge reveal controller', () => {
  it('starts hidden and requires a dwell on the selected right edge near the HUD height', () => {
    const controller = new HudHoverController()
    expect(controller.step(0, away, bounds)).toEqual({ reveal: 0, visible: false, interactive: false })
    expect(controller.step(10, { x: 2559, y: 50 }, bounds).visible).toBe(false)
    expect(controller.step(20, { x: 2560, y: 650 }, bounds).visible).toBe(false)
    controller.step(30, edge, bounds)
    expect(controller.step(30 + HUD_ENTER_DELAY_MS - 1, edge, bounds).visible).toBe(false)
    expect(controller.step(30 + HUD_ENTER_DELAY_MS, edge, bounds)).toMatchObject({ visible: true, reveal: 0 })
  })
  it('ignores a quick edge crossing and resets the dwell', () => {
    const controller = new HudHoverController()
    controller.step(0, edge, bounds); controller.step(100, away, bounds)
    expect(controller.step(160, edge, bounds).visible).toBe(false)
    expect(controller.step(250, edge, bounds).visible).toBe(false)
  })
  it('produces intermediate slide frames and keeps the trigger edge click-through', () => {
    const controller = new HudHoverController()
    controller.step(0, edge, bounds); controller.step(140, edge, bounds)
    const mid = controller.step(220, edge, bounds)
    expect(mid.reveal).toBeGreaterThan(0); expect(mid.reveal).toBeLessThan(1)
    expect(mid.interactive).toBe(false)
    expect(controller.step(700, panel, bounds)).toEqual({ reveal: 1, visible: true, interactive: true })
    expect(controller.step(720, edge, bounds).interactive).toBe(false)
  })
  it('buffers departure, then smoothly hides without flicker', () => {
    const controller = new HudHoverController(); reveal(controller)
    controller.step(720, away, bounds)
    expect(controller.step(720 + HUD_LEAVE_DELAY_MS - 1, away, bounds).reveal).toBe(1)
    expect(controller.step(720 + HUD_LEAVE_DELAY_MS, away, bounds).reveal).toBe(1)
    const closing = controller.step(1300, away, bounds)
    expect(closing.reveal).toBeGreaterThan(0); expect(closing.reveal).toBeLessThan(1)
    expect(controller.step(1900, away, bounds)).toEqual({ reveal: 0, visible: false, interactive: false })
  })
  it('cancels departure when the pointer returns before the delay', () => {
    const controller = new HudHoverController(); reveal(controller)
    controller.step(720, away, bounds); controller.step(1000, panel, bounds)
    expect(controller.step(1400, panel, bounds).reveal).toBe(1)
  })
  it('reverses an in-progress close continuously and settles without overshoot', () => {
    const controller = new HudHoverController(); reveal(controller)
    controller.step(720, away, bounds); controller.step(1170, away, bounds)
    const closing = controller.step(1250, away, bounds)
    const reversal = controller.step(1250, edge, bounds)
    expect(reversal.reveal).toBe(closing.reveal)
    for (let time = 1266; time < 1800; time += 16) {
      const frame = controller.step(time, edge, bounds)
      expect(frame.reveal).toBeGreaterThanOrEqual(0); expect(frame.reveal).toBeLessThanOrEqual(1)
    }
    expect(controller.step(1900, edge, bounds).reveal).toBe(1)
  })
  it('supports negative coordinates, monitor changes and an expanded rectangle', () => {
    const controller = new HudHoverController(); reveal(controller); controller.reset()
    const monitor = { x: -376, y: -300, width: 376, height: 536 }
    expect(controller.step(2000, edge, monitor).visible).toBe(false)
    controller.step(2050, { x: -1, y: -100 }, monitor)
    controller.step(2190, { x: -1, y: -100 }, monitor)
    expect(controller.step(2700, { x: -200, y: -100 }, monitor).interactive).toBe(true)
  })
  it('suspends and resumes hover without losing layout or letting the edge consume clicks', () => {
    const controller = new HudHoverController(); reveal(controller)
    controller.setEnabled(false)
    expect(controller.step(720, edge, bounds).interactive).toBe(false)
    expect(controller.step(1400, edge, bounds).visible).toBe(false)
    controller.setEnabled(true)
    expect(controller.step(1500, edge, bounds).visible).toBe(false)
    controller.step(1640, edge, bounds)
    expect(controller.step(2200, edge, bounds)).toEqual({ reveal: 1, visible: true, interactive: false })
  })
})
