/** Two bounded content layers. Reversal preserves the current composition. */
export interface ContentBlend<T> { current?: T; previous?: T; progress: number }
export function selectContent<T extends { key: string }>(blend: ContentBlend<T>, next: T | undefined, reduced = false): ContentBlend<T> {
  if (!next) return { current: blend.current, progress: 1 }
  if (reduced || !blend.current) return { current: next, progress: 1 }
  if (blend.current.key === next.key) return { ...blend, current: next }
  if (blend.previous?.key === next.key) return { current: next, previous: blend.current, progress: 1 - blend.progress }
  return { current: next, previous: blend.progress >= .5 ? blend.current : blend.previous ?? blend.current, progress: 0 }
}
export function advanceContent<T>(blend: ContentBlend<T>, elapsedMs: number): ContentBlend<T> {
  const progress = Math.min(1, blend.progress + Math.max(0, elapsedMs) / 160)
  return { current: blend.current, previous: progress === 1 ? undefined : blend.previous, progress }
}
