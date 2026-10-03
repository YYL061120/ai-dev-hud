import type { UsageMetadataTransfer } from './usage-metadata.js'
import { validateUsageTransfer } from './usage-metadata.js'

/** A container for existing version-1 transfers, not a new record/sync schema. */
export const USAGE_CHUNK_RECORDS = 1000
export const USAGE_CHUNK_LINE_BYTES = 2 * 1024 * 1024
export interface UsageChunkHeader { format: 'ai-dev-hud-usage-chunks'; version: 1; type: 'header'; exportedAt: number }
export interface UsageChunkFooter { format: 'ai-dev-hud-usage-chunks'; version: 1; type: 'complete'; chunks: number; records: number }
export type UsageChunkLine = UsageChunkHeader | UsageMetadataTransfer | UsageChunkFooter
export interface UsageExportProgress { id: string; state: 'pending' | 'running' | 'complete' | 'cancelled' | 'failed'; chunks: number; records: number; message?: string }
export function validateUsageChunkLine(value: unknown): UsageChunkLine {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid chunk container')
  const row = value as Record<string, unknown>
  if (row.format === 'ai-dev-hud-usage') {
    const transfer = validateUsageTransfer(value)
    if (transfer.records.length > USAGE_CHUNK_RECORDS || !transfer.records.length) throw new Error('Invalid chunk size')
    return transfer
  }
  const keys = row.type === 'header' ? ['format', 'version', 'type', 'exportedAt'] : ['format', 'version', 'type', 'chunks', 'records']
  if (row.format !== 'ai-dev-hud-usage-chunks' || row.version !== 1 || Object.keys(row).length !== keys.length || Object.keys(row).some(k => !keys.includes(k))) throw new Error('Invalid chunk container')
  const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
  if (row.type === 'header' && count(row.exportedAt) && (row.exportedAt as number) <= 8_640_000_000_000_000) return value as UsageChunkHeader
  if (row.type === 'complete' && count(row.chunks) && count(row.records)) return value as UsageChunkFooter
  throw new Error('Invalid chunk container')
}
