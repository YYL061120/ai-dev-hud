export const HUD_COLLAPSED_WIDTH = 56
export const HUD_EXPANDED_WIDTH = 376
export const HUD_COLLAPSED_HEIGHT = 216
export const HUD_EXPANDED_HEIGHT = 536

export interface HudState { expanded: boolean; displayId: number; reveal: number; hoverEnabled: boolean; detailBridgeHeld?: boolean }
export interface HudArea { x: number; y: number; width: number; height: number }

/** Restore the chosen monitor; default and unplugged-monitor fallback are primary. */
export function getHudDisplayId(displays: Array<{ id: number }>, preferred: number | undefined, primaryId: number): number {
  return displays.some(display => display.id === preferred) ? preferred! : primaryId
}

/** Electron screen/workArea and window bounds use DIP, including mixed-DPI monitors. */
export function getHudBounds(area: HudArea, expanded: boolean): HudArea {
  const width = Math.min(area.width, expanded ? HUD_EXPANDED_WIDTH : HUD_COLLAPSED_WIDTH)
  const height = Math.min(area.height, expanded ? HUD_EXPANDED_HEIGHT : HUD_COLLAPSED_HEIGHT)
  return { x: area.x + area.width - width, y: area.y + Math.floor((area.height - height) / 2), width, height }
}

/** Stable transparent canvas: renderer anchors the rail at the same screen Y. */
export function getHudCanvasBounds(area: HudArea): HudArea {
  return getHudBounds(area, true)
}
export function getHudRailBounds(canvas: HudArea): HudArea {
  const height = Math.min(canvas.height, HUD_COLLAPSED_HEIGHT)
  const width = Math.min(canvas.width, HUD_COLLAPSED_WIDTH)
  return { x: canvas.x + canvas.width - width, y: canvas.y + Math.floor((canvas.height - height) / 2), width, height }
}
