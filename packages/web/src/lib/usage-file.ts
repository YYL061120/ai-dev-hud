import { validateUsageTransfer, type MetadataImportResult, type UsageMetadataTransfer } from '../../../core/src/usage-metadata.js'
import { USAGE_CHUNK_LINE_BYTES, validateUsageChunkLine } from '../../../core/src/usage-transfer.js'

export interface FileImportProgress {
  state: 'running' | 'complete' | 'cancelled' | 'failed'; chunks: number; records: number; bytes: number; totalBytes: number
  result: MetadataImportResult; message?: string; uncertain?: boolean
}
const empty = (): MetadataImportResult => ({ added: 0, updated: 0, duplicates: 0, conflicts: 0 })
/** Streaming line reader has a hard per-line bound. It never reads the entire JSONL file. */
async function* lines(file: File, progress: FileImportProgress) {
  const reader = file.stream().getReader(), decoder = new TextDecoder('utf-8', { fatal: true })
  let pending = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      progress.bytes += value.byteLength
      pending += decoder.decode(value, { stream: true })
      let next: number
      while ((next = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, next); pending = pending.slice(next + 1)
        if (!line.trim() || new TextEncoder().encode(line).byteLength > USAGE_CHUNK_LINE_BYTES) throw new Error('Invalid or oversized metadata line')
        yield line
      }
      if (pending.length > USAGE_CHUNK_LINE_BYTES) throw new Error('Oversized metadata line')
    }
    pending += decoder.decode()
    if (pending) {
      if (!pending.trim() || new TextEncoder().encode(pending).byteLength > USAGE_CHUNK_LINE_BYTES) throw new Error('Invalid or oversized metadata line')
      yield pending
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
/** Cancellation is between acknowledged atomic batches, so committed prefixes are accurately reported. */
export async function importUsageFile(file: File, send: (value: UsageMetadataTransfer) => Promise<MetadataImportResult>, cancelled: () => boolean, update: (progress: FileImportProgress) => void): Promise<FileImportProgress> {
  const progress: FileImportProgress = { state: 'running', chunks: 0, records: 0, bytes: 0, totalBytes: file.size, result: empty() }
  const emit = () => update({ ...progress, result: { ...progress.result } })
  const batch = async (transfer: UsageMetadataTransfer) => {
    try {
      const result = await send(transfer)
      for (const key of ['added', 'updated', 'duplicates', 'conflicts'] as const) progress.result[key] += result[key]
      progress.chunks++; progress.records += transfer.records.length; emit()
    } catch (error) { progress.uncertain = true; throw error }
  }
  emit()
  try {
    if (/\.json$/i.test(file.name)) {
      if (file.size > 10 * 1024 * 1024) throw new Error('Legacy JSON exceeds 10 MiB; use a chunked JSONL export')
      const transfer = validateUsageTransfer(JSON.parse(await file.text()))
      if (cancelled()) { progress.state = 'cancelled'; return progress }
      await batch(transfer); progress.bytes = file.size
      progress.state = cancelled() ? 'cancelled' : 'complete'
    } else {
      let header = false, footer = false
      for await (const line of lines(file, progress)) {
        if (cancelled()) { progress.state = 'cancelled'; break }
        if (footer) throw new Error('Unexpected data after completion footer')
        const value = validateUsageChunkLine(JSON.parse(line))
        if (!header) {
          if (value.format !== 'ai-dev-hud-usage-chunks' || value.type !== 'header') throw new Error('Chunk header required')
          header = true
        } else if (value.format === 'ai-dev-hud-usage') await batch(value)
        else if (value.type === 'complete' && value.chunks === progress.chunks && value.records === progress.records) footer = true
        else throw new Error('Invalid or mismatched completion footer')
      }
      if (progress.state !== 'cancelled') {
        if (!header || !footer) throw new Error('Incomplete file: completion footer missing')
        progress.state = 'complete'; progress.bytes = file.size
      }
    }
  } catch (error) { progress.state = 'failed'; progress.message = error instanceof Error ? error.message : 'Import failed' }
  finally { emit() }
  return progress
}
