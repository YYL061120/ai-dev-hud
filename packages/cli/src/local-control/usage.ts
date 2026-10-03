import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { aggregateUsage, safeUsageIdentifier, TRANSFER_RECORD_LIMIT, USAGE_METADATA_FIELDS, validateUsageTransfer, type UsageMetadataRecord, type UsageMetadataTransfer, type MetadataImportResult } from '@aiusage/core'
import { LOCAL_RECORDS_WHERE } from '../db/records.js'
import { LocalControlError } from './projects.js'
const hash = (namespace: string, value: string) => createHash('sha256').update(`${namespace}\0${value}`).digest('hex')
export const deviceKeyFor = (id: string) => hash('device', id)
const projectPathKey = (value: string) => /^[a-z]:|\\/.test(value.toLowerCase()) ? value.replaceAll('\\', '/').toLowerCase().replace(/\/+$/, '') : value.replace(/\/+$/, '')
function localRow(row: any, currentId: string): UsageMetadataRecord {
  const deviceId = !row.device_instance_id || row.device_instance_id === 'unknown' ? currentId : row.device_instance_id
  const deviceKey = deviceKeyFor(deviceId)
  return {
    deviceKey, recordKey: hash('record', `${deviceKey}\0${row.id}`), projectKey: row.cwd ? hash('project', `${deviceKey}\0${projectPathKey(row.cwd)}`) : null,
    sessionKey: row.session_id ? hash('session', `${deviceKey}\0${row.tool}\0${row.session_id}`) : null,
    ts: row.ts, updatedAt: row.updated_at, tool: row.tool, model: safeUsageIdentifier(row.model), provider: safeUsageIdentifier(row.provider),
    platform: ['win32', 'darwin', 'linux'].includes(row.platform) ? row.platform : 'unknown', inputTokens: row.input_tokens, outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens, cacheWriteTokens: row.cache_write_tokens, thinkingTokens: row.thinking_tokens, cost: row.cost,
    costSource: ['log', 'pricing', 'unknown'].includes(row.cost_source) ? row.cost_source : 'unknown',
  }
}
export class UsageMetadataStore {
  constructor(private db: Database.Database, private currentId: string) {}
  projectKeyFor(cwd: string): string { return hash('project', `${deviceKeyFor(this.currentId)}\0${projectPathKey(cwd)}`) }
  private exists() { return !!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hud_usage_metadata'").get() }
  private localRecords(): UsageMetadataRecord[] {
    // Explicit projection: no raw content, source_file, hostnames, or tool-call arguments are read.
    const rows = this.db.prepare(`SELECT id, ts, updated_at, tool, model, provider, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, cost_source, session_id, cwd, device_instance_id, platform FROM records WHERE ${LOCAL_RECORDS_WHERE}`).all()
    return rows.map(row => localRow(row, this.currentId))
  }
  private records(): UsageMetadataRecord[] {
    const local = this.localRecords(); const keyed = new Map(local.map(r => [`${r.deviceKey}:${r.recordKey}`, r]))
    if (this.exists()) for (const row of this.db.prepare('SELECT payload FROM hud_usage_metadata').all() as Array<{ payload: string }>) {
      const record = JSON.parse(row.payload) as UsageMetadataRecord
      const key = `${record.deviceKey}:${record.recordKey}`
      if (!keyed.has(key)) keyed.set(key, record)
    }
    return [...keyed.values()]
  }
  overview(period = 'thirty', device?: string, project?: string, now?: Date) {
    return aggregateUsage(this.records(), deviceKeyFor(this.currentId), period, device, project, now)
  }
  export(): UsageMetadataTransfer {
    const records = this.records()
    if (records.length > TRANSFER_RECORD_LIMIT) throw new LocalControlError('Export exceeds 50,000 records; large-history chunked export is not yet available', 409)
    const transfer: UsageMetadataTransfer = { format: 'ai-dev-hud-usage', version: 1, exportedAt: Date.now(), records }
    try { validateUsageTransfer(transfer) } catch { throw new LocalControlError('Some local records need normalized usage values before export', 409) }
    if (Buffer.byteLength(JSON.stringify(transfer)) > 10 * 1024 * 1024) throw new LocalControlError('Export exceeds 10 MiB; chunked export is not yet available', 409)
    return transfer
  }
  import(value: unknown): MetadataImportResult {
    let transfer: UsageMetadataTransfer
    try { transfer = validateUsageTransfer(value) } catch { throw new LocalControlError('Invalid version 1 usage metadata or non-allowlisted fields') }
    const local = new Set(this.localRecords().map(r => `${r.deviceKey}:${r.recordKey}`))
    return this.db.transaction(() => {
      this.db.exec('CREATE TABLE IF NOT EXISTS hud_usage_metadata (device_key TEXT NOT NULL, record_key TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(device_key, record_key))')
      const get = this.db.prepare('SELECT updated_at, payload FROM hud_usage_metadata WHERE device_key=? AND record_key=?')
      const put = this.db.prepare('INSERT INTO hud_usage_metadata(device_key, record_key, updated_at, payload) VALUES (?,?,?,?) ON CONFLICT(device_key,record_key) DO UPDATE SET updated_at=excluded.updated_at, payload=excluded.payload')
      const result: MetadataImportResult = { added: 0, updated: 0, duplicates: 0, conflicts: 0 }
      for (const input of transfer.records) {
        // Canonical property order makes semantic equality independent of JSON key order.
        const record = Object.fromEntries(USAGE_METADATA_FIELDS.map(key => [key, input[key]])) as unknown as UsageMetadataRecord
        if (local.has(`${record.deviceKey}:${record.recordKey}`)) { result.duplicates++; continue }
        const previous = get.get(record.deviceKey, record.recordKey) as { updated_at: number; payload: string } | undefined
        const payload = JSON.stringify(record)
        if (previous && previous.updated_at === record.updatedAt && previous.payload !== payload) { result.conflicts++; continue }
        if (previous && previous.updated_at >= record.updatedAt) { result.duplicates++; continue }
        put.run(record.deviceKey, record.recordKey, record.updatedAt, payload)
        if (previous) result.updated++; else result.added++
      }
      return result
    })()
  }
}
