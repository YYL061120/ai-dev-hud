import { describe, expect, it } from 'vitest'
import { HudHoverController, HUD_ENTER_DELAY_MS, HUD_LEAVE_DELAY_MS } from '../src/hud-hover'
import { getHudDisplayId } from '../src/hud-window'

const bounds = { x: 2504, y: 588, width: 56, height: 216 }
const workArea = { x: 0, y: 0, width: 2560, height: 1392 }
const edge = { x: 2559, y: 650 }, panel = { x: 2530, y: 650 }, away = { x: 2000, y: 650 }
function reveal(controller: HudHoverController) {
  controller.step(0, edge, bounds, workArea)
  controller.step(HUD_ENTER_DELAY_MS, edge, bounds, workArea)
  return controller.step(700, edge, bounds, workArea)
}

describe('HUD edge reveal controller', () => {
  it('starts hidden and requires a dwell on the selected right edge within the selected work area', () => {
    const controller = new HudHoverController()
    expect(controller.step(0, away, bounds, workArea)).toEqual({ reveal: 0, visible: false, interactive: false })
    expect(controller.step(10, { x: 2559, y: -1 }, bounds, workArea).visible).toBe(false)
    expect(controller.step(20, { x: 2560, y: 650 }, bounds, workArea).visible).toBe(false)
    controller.step(30, edge, bounds, workArea)
    expect(controller.step(30 + HUD_ENTER_DELAY_MS - 1, edge, bounds, workArea).visible).toBe(false)
    expect(controller.step(30 + HUD_ENTER_DELAY_MS, edge, bounds, workArea)).toMatchObject({ visible: true, reveal: 0 })
  })
  it('ignores a quick edge crossing and resets the dwell', () => {
    const controller = new HudHoverController()
    controller.step(0, edge, bounds, workArea); controller.step(100, away, bounds, workArea)
    expect(controller.step(160, edge, bounds, workArea).visible).toBe(false)
    expect(controller.step(250, edge, bounds, workArea).visible).toBe(false)
  })
  it('wakes from upper and lower usable edges outside the invisible panel height', () => {
    for (const y of [workArea.y, 50, workArea.y + workArea.height - 1]) {
      const controller = new HudHoverController()
      const pointer = { x: 2554, y }
      controller.step(0, pointer, bounds, workArea)
      expect(controller.step(HUD_ENTER_DELAY_MS - 1, pointer, bounds, workArea).visible).toBe(false)
      controller.step(HUD_ENTER_DELAY_MS, pointer, bounds, workArea)
      expect(controller.step(700, pointer, bounds, workArea)).toEqual({ reveal: 1, visible: true, interactive: false })
      expect(controller.step(1600, pointer, bounds, workArea).reveal).toBe(1)
    }
  })
  it('ignores the other monitor edge, outside the near-edge strip and taskbar area', () => {
    for (const pointer of [{ x: 3639, y: 50 }, { x: 2527, y: 50 }, { x: 2559, y: 1392 }, { x: 2560, y: 650 }]) {
      const controller = new HudHoverController()
      controller.step(0, pointer, bounds, workArea)
      expect(controller.step(1000, pointer, bounds, workArea)).toEqual({ reveal: 0, visible: false, interactive: false })
    }
  })
  it('accepts a dwell inside the monitor seam band while leaving rail buttons clickable', () => {
    const controller = new HudHoverController()
    const seam = { x: 2536, y: 50 }
    controller.step(0, seam, bounds, workArea)
    expect(controller.step(HUD_ENTER_DELAY_MS - 1, seam, bounds, workArea).visible).toBe(false)
    controller.step(HUD_ENTER_DELAY_MS, seam, bounds, workArea)
    expect(controller.step(700, seam, bounds, workArea).visible).toBe(true)
    expect(controller.step(720, panel, bounds, workArea).interactive).toBe(true)
    expect(controller.step(740, edge, bounds, workArea).interactive).toBe(false)
  })
  it('restores a chosen monitor and uses primary for first launch or a missing monitor', () => {
    const displays = [{ id: 101 }, { id: 202 }]
    expect(getHudDisplayId(displays, undefined, 101)).toBe(101)
    expect(getHudDisplayId(displays, 101, 101)).toBe(101)
    expect(getHudDisplayId(displays, 202, 101)).toBe(202)
    expect(getHudDisplayId(displays, 303, 101)).toBe(101)
  })
  it('produces intermediate slide frames and keeps the trigger edge click-through', () => {
    const controller = new HudHoverController()
    controller.step(0, edge, bounds, workArea); controller.step(140, edge, bounds, workArea)
    const mid = controller.step(220, edge, bounds, workArea)
    expect(mid.reveal).toBeGreaterThan(0); expect(mid.reveal).toBeLessThan(1)
    expect(mid.interactive).toBe(false)
    expect(controller.step(700, panel, bounds, workArea)).toEqual({ reveal: 1, visible: true, interactive: true })
    expect(controller.step(720, edge, bounds, workArea).interactive).toBe(false)
  })
  it('buffers departure, then smoothly hides without flicker', () => {
    const controller = new HudHoverController(); reveal(controller)
    controller.step(720, away, bounds, workArea)
    expect(controller.step(720 + HUD_LEAVE_DELAY_MS - 1, away, bounds, workArea).reveal).toBe(1)
    expect(controller.step(720 + HUD_LEAVE_DELAY_MS, away, bounds, workArea).reveal).toBe(1)
    const closing = controller.step(1300, away, bounds, workArea)
    expect(closing.reveal).toBeGreaterThan(0); expect(closing.reveal).toBeLessThan(1)
    expect(controller.step(1900, away, bounds, workArea)).toEqual({ reveal: 0, visible: false, interactive: false })
  })
  it('cancels departure when the pointer returns before the delay', () => {
    const controller = new HudHoverController(); reveal(controller)
    controller.step(720, away, bounds, workArea); controller.step(1000, panel, bounds, workArea)
    expect(controller.step(1400, panel, bounds, workArea).reveal).toBe(1)
  })
  it('reverses an in-progress close continuously and settles without overshoot', () => {
    const controller = new HudHoverController(); reveal(controller)
    controller.step(720, away, bounds, workArea); controller.step(1170, away, bounds, workArea)
    const closing = controller.step(1250, away, bounds, workArea)
    const reversal = controller.step(1250, edge, bounds, workArea)
    expect(reversal.reveal).toBe(closing.reveal)
    for (let time = 1266; time < 1800; time += 16) {
      const frame = controller.step(time, edge, bounds, workArea)
      expect(frame.reveal).toBeGreaterThanOrEqual(0); expect(frame.reveal).toBeLessThanOrEqual(1)
    }
    expect(controller.step(1900, edge, bounds, workArea).reveal).toBe(1)
  })
  it('supports negative coordinates, monitor changes and an expanded rectangle', () => {
    const controller = new HudHoverController(); reveal(controller); controller.reset()
    const monitor = { x: -376, y: -300, width: 376, height: 536 }
    expect(controller.step(2000, edge, monitor, monitor).visible).toBe(false)
    controller.step(2050, { x: -1, y: -100 }, monitor, monitor)
    controller.step(2190, { x: -1, y: -100 }, monitor, monitor)
    expect(controller.step(2700, { x: -200, y: -100 }, monitor, monitor).interactive).toBe(true)
  })
  it('suspends and resumes hover without losing layout or letting the edge consume clicks', () => {
    const controller = new HudHoverController(); reveal(controller)
    controller.setEnabled(false)
    expect(controller.step(720, edge, bounds, workArea).interactive).toBe(false)
    expect(controller.step(1400, edge, bounds, workArea).visible).toBe(false)
    controller.setEnabled(true)
    expect(controller.step(1500, edge, bounds, workArea).visible).toBe(false)
    controller.step(1640, edge, bounds, workArea)
    expect(controller.step(2200, edge, bounds, workArea)).toEqual({ reveal: 1, visible: true, interactive: false })
  })
})
