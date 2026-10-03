import type { HudArea } from './hud-window'

export interface HudPointer { x: number; y: number }
export interface HudHoverFrame { reveal: number; visible: boolean; interactive: boolean }
export const HUD_EDGE_WIDTH = 8
export const HUD_ENTER_DELAY_MS = 140
export const HUD_LEAVE_DELAY_MS = 450
const POINTER_MARGIN = 10
const SPRING_SPEED = 26

/** Clock-driven state machine; screen coordinates and bounds are always DIP.
 * Critically damped motion retains velocity on reversal, without overshoot.
 */
export class HudHoverController {
  enabled = true
  private reveal = 0
  private velocity = 0
  private target = 0
  private enteredAt: number | null = null
  private leftAt: number | null = null
  private lastAt: number | null = null

  reset(): void {
    this.reveal = 0; this.velocity = 0; this.target = 0
    this.enteredAt = null; this.leftAt = null; this.lastAt = null
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.enteredAt = null; this.leftAt = null
    if (!enabled) this.target = 0
  }

  step(now: number, pointer: HudPointer, bounds: HudArea, workArea: HudArea): HudHoverFrame {
    const previousTarget = this.target
    const right = bounds.x + bounds.width
    // The hidden panel is undiscoverable: wake it anywhere on this monitor's
    // usable right edge, independently of the panel height or animation width.
    const edgeRight = workArea.x + workArea.width
    const atEdge = pointer.x >= edgeRight - HUD_EDGE_WIDTH && pointer.x < edgeRight
      && pointer.y >= workArea.y && pointer.y < workArea.y + workArea.height
    const revealedLeft = right - bounds.width * this.reveal
    const overPanel = this.reveal > 0 && pointer.x >= revealedLeft - POINTER_MARGIN && pointer.x < right
      && pointer.y >= bounds.y - POINTER_MARGIN && pointer.y < bounds.y + bounds.height + POINTER_MARGIN

    if (this.enabled) {
      if (atEdge || overPanel) {
        this.leftAt = null
        if (this.target === 0) {
          if (this.reveal > 0) this.target = 1
          else {
            this.enteredAt ??= now
            if (now - this.enteredAt >= HUD_ENTER_DELAY_MS) this.target = 1
          }
        }
      } else {
        this.enteredAt = null
        if (this.target === 1) {
          this.leftAt ??= now
          if (now - this.leftAt >= HUD_LEAVE_DELAY_MS) this.target = 0
        }
      }
    }

    const elapsed = this.lastAt === null || previousTarget !== this.target ? 0 : Math.max(0, now - this.lastAt) / 1000
    this.lastAt = now
    const offset = this.reveal - this.target
    const momentum = this.velocity + SPRING_SPEED * offset
    const decay = Math.exp(-SPRING_SPEED * elapsed)
    this.reveal = this.target + (offset + momentum * elapsed) * decay
    this.velocity = (this.velocity - SPRING_SPEED * momentum * elapsed) * decay
    this.reveal = Math.max(0, Math.min(1, this.reveal))
    if (Math.abs(this.reveal - this.target) < 0.001 && Math.abs(this.velocity) < 0.02) {
      this.reveal = this.target; this.velocity = 0
    }
    const interactive = this.enabled && this.reveal > 0.05
      && pointer.x >= right - bounds.width * this.reveal && pointer.x < right - HUD_EDGE_WIDTH
      && pointer.y >= bounds.y && pointer.y < bounds.y + bounds.height
    return { reveal: this.reveal, visible: this.reveal > 0 || this.target === 1, interactive }
  }
}
