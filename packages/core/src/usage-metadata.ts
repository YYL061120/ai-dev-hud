import { TOOLS, type Tool, type StatsRecord } from './types.js'
export interface UsageMetadataRecord {
  deviceKey: string; recordKey: string; projectKey: string | null; sessionKey: string | null
  ts: number; updatedAt: number; tool: Tool; model: string; provider: string; platform: 'win32' | 'darwin' | 'linux' | 'unknown'
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; thinkingTokens: number
  cost: number; costSource: StatsRecord['costSource']
}
export interface UsageMetadataTransfer { format: 'ai-dev-hud-usage'; version: 1; exportedAt: number; records: UsageMetadataRecord[] }
export interface MetadataImportResult { added: number; updated: number; duplicates: number; conflicts: number }
/** Contract only: implementations must be explicitly configured; no adapter runs by default. */
export interface UsageMetadataSyncAdapter {
  readonly id: string
  pull(signal?: AbortSignal): Promise<UsageMetadataTransfer>
  push(transfer: UsageMetadataTransfer, signal?: AbortSignal): Promise<void>
}
export const TRANSFER_RECORD_LIMIT = 50_000
export const USAGE_METADATA_FIELDS = ['deviceKey', 'recordKey', 'projectKey', 'sessionKey', 'ts', 'updatedAt', 'tool', 'model', 'provider', 'platform', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'thinkingTokens', 'cost', 'costSource'] as const
const fields: readonly string[] = USAGE_METADATA_FIELDS
const hex = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const identifier = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:+/@-]{0,127}$/.test(v) && !/^[A-Za-z]:/.test(v)
const timestamp = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 8_640_000_000_000_000
export function validateUsageTransfer(value: unknown): UsageMetadataTransfer {
  const invalid = () => { throw new Error('Invalid usage metadata: expected version 1, allowlisted fields, safe identifiers and non-negative finite counts') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  const doc = value as Record<string, unknown>
  if (Object.keys(doc).some(k => !['format', 'version', 'exportedAt', 'records'].includes(k)) || doc.format !== 'ai-dev-hud-usage' || doc.version !== 1 || !timestamp(doc.exportedAt) || !Array.isArray(doc.records) || doc.records.length > TRANSFER_RECORD_LIMIT) return invalid()
  for (const item of doc.records) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length !== fields.length || Object.keys(item).some(k => !fields.includes(k))) return invalid()
    const row = item as Record<string, unknown>
    if (!hex(row.deviceKey) || !hex(row.recordKey) || (row.projectKey !== null && !hex(row.projectKey)) || (row.sessionKey !== null && !hex(row.sessionKey)) || !timestamp(row.ts) || !timestamp(row.updatedAt) || !(TOOLS as readonly unknown[]).includes(row.tool) || !identifier(row.model) || !identifier(row.provider) || !['win32', 'darwin', 'linux', 'unknown'].includes(String(row.platform)) || !['log', 'pricing', 'unknown'].includes(String(row.costSource))) return invalid()
    for (const field of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'thinkingTokens']) if (typeof row[field] !== 'number' || !Number.isSafeInteger(row[field]) || (row[field] as number) < 0 || (row[field] as number) > 1e15) return invalid()
    if (typeof row.cost !== 'number' || !Number.isFinite(row.cost) || row.cost < 0 || row.cost > 1e9) return invalid()
  }
  return value as UsageMetadataTransfer
}
export const safeUsageIdentifier = (value: unknown): string => identifier(value) ? value as string : 'unknown'
export interface UsageTotals { tokens: number; cost: number; records: number; sessions: number }
export interface UsageBreakdown extends UsageTotals { key: string }
export interface UsageOverview {
  currentDeviceKey: string; periods: { today: UsageTotals; seven: UsageTotals; thirty: UsageTotals; lifetime: UsageTotals }
  selected: UsageTotals; models: UsageBreakdown[]; devices: UsageBreakdown[]; projects: UsageBreakdown[]
  heatmap: Array<{ day: string; tokens: number; records: number; cost: number }>
  projectLabels: Record<string, string>
  sync: { configured: false }
}
export const usageTokens = (r: UsageMetadataRecord) => r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens + r.thinkingTokens
export function usageTotals(records: UsageMetadataRecord[]): UsageTotals {
  return { tokens: records.reduce((s, r) => s + usageTokens(r), 0), cost: records.reduce((s, r) => s + r.cost, 0), records: records.length, sessions: new Set(records.flatMap(r => r.sessionKey ? [`${r.deviceKey}:${r.tool}:${r.sessionKey}`] : [])).size }
}
export function localDay(ts: number): string { const date = new Date(ts); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
/** Calendar arithmetic handles local midnight and DST; rolling windows include today. */
export function usageSince(period: string, now = new Date()): number {
  if (!['today', 'seven', 'thirty', 'lifetime'].includes(period)) throw new Error('Invalid usage period')
  const days = period === 'seven' ? 6 : period === 'thirty' ? 29 : 0
  return period === 'lifetime' ? 0 : new Date(now.getFullYear(), now.getMonth(), now.getDate() - days).getTime()
}
export function aggregateUsage(records: UsageMetadataRecord[], currentDeviceKey: string, period: string, device?: string, project?: string, now = new Date()): UsageOverview {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
  const filtered = records.filter(r => r.ts < end && (!device || r.deviceKey === device) && (!project || (r.projectKey ?? 'unknown') === project))
  const select = (p: string) => filtered.filter(r => r.ts >= usageSince(p, now))
  const selected = select(period)
  const grouped = (field: 'model' | 'deviceKey' | 'projectKey') => {
    const buckets = new Map<string, UsageMetadataRecord[]>()
    for (const row of selected) { const key = row[field] ?? 'unknown'; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key)!.push(row) }
    return [...buckets].map(([key, rows]) => ({ key, ...usageTotals(rows) })).sort((a, b) => b.tokens - a.tokens || a.key.localeCompare(b.key))
  }
  const days = new Map<string, { day: string; tokens: number; records: number; cost: number }>()
  for (const row of selected) { const day = localDay(row.ts); const bucket = days.get(day) ?? { day, tokens: 0, records: 0, cost: 0 }; bucket.tokens += usageTokens(row); bucket.records++; bucket.cost += row.cost; days.set(day, bucket) }
  return { currentDeviceKey, periods: { today: usageTotals(select('today')), seven: usageTotals(select('seven')), thirty: usageTotals(select('thirty')), lifetime: usageTotals(select('lifetime')) }, selected: usageTotals(selected), models: grouped('model'), devices: grouped('deviceKey'), projects: grouped('projectKey'), heatmap: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)), projectLabels: {}, sync: { configured: false } }
}
