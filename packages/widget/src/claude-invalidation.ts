import { watchFile, unwatchFile, type Stats } from 'node:fs'
/** Local metadata signal only. Renderer consumes typed snapshots, never this file. */
export function observeClaudeInvalidation(file: string, invalidate: () => void): () => void {
  const listener = (current: Stats, previous: Stats) => {
    if (current.mtimeMs !== previous.mtimeMs || current.ino !== previous.ino) invalidate()
  }
  watchFile(file, { interval: 100, persistent: false }, listener)
  return () => unwatchFile(file, listener)
}
