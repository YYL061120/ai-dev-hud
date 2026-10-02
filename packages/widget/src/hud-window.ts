export const HUD_COLLAPSED_WIDTH = 56
export const HUD_EXPANDED_WIDTH = 376
export const HUD_COLLAPSED_HEIGHT = 216
export const HUD_EXPANDED_HEIGHT = 536

export interface HudState { expanded: boolean; displayId: number; reveal: number; hoverEnabled: boolean }
export interface HudArea { x: number; y: number; width: number; height: number }

/** Electron screen/workArea and window bounds use DIP, including mixed-DPI monitors. */
export function getHudBounds(area: HudArea, expanded: boolean): HudArea {
  const width = Math.min(area.width, expanded ? HUD_EXPANDED_WIDTH : HUD_COLLAPSED_WIDTH)
  const height = Math.min(area.height, expanded ? HUD_EXPANDED_HEIGHT : HUD_COLLAPSED_HEIGHT)
  return { x: area.x + area.width - width, y: area.y + Math.floor((area.height - height) / 2), width, height }
}
