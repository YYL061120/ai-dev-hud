import { usageSince, usageTokens, usageTotals, type UsageMetadataRecord, type UsageTotals } from './usage-metadata.js'
import type { ToolSubscription } from './subscription-usage.js'
export type UsagePeriod = 'today' | 'seven' | 'thirty' | 'lifetime'
export interface DeviceUsageOrigin { source: 'local' | 'imported' | 'mixed'; importedAt: number | null }
export interface RingBreakdown { tool: string; provider: string; model: string; tokens: number; cost: number | null; missingEstimates: number }
export interface UsageRing extends UsageTotals {
  toolNames?: string[]
  key: string; kind: 'total' | 'device'; platform: UsageMetadataRecord['platform']; source: DeviceUsageOrigin['source'] | 'aggregate'
  importedAt: number | null; share: number | null; estimatedCost: number | null; missingEstimates: number; models: RingBreakdown[]
}
export interface UsageRingsSnapshot {
  subscriptions?: ToolSubscription[]
  /** Missing/null means no current login ownership can be proved: all quota progress stays unknown. */
  subscriptionGenerations?: Record<string, string | null>
  version: 1; period: UsagePeriod; since: number; until: number; generatedAt: number; currentDeviceKey: string
  metric: 'observed-device-token-share'; total: UsageRing; devices: UsageRing[]; syncConfigured: false
}
export interface RingToolUsage { tool: string; tokens: number; cost: number | null; missingEstimates: number; models: RingBreakdown[] }
/** Presentation consumes these typed groups, keeping aggregation outside the UI. */
export function ringToolUsage(ring: UsageRing, trackedTools: string[] = []): RingToolUsage[] {
  const tools = new Set([...trackedTools, ...(ring.toolNames ?? []), ...ring.models.map(model => model.tool)])
  const order = (tool: string) => tool === 'claude-code' ? 0 : tool === 'codex' ? 1 : 2
  return [...tools].sort((a, b) => order(a) - order(b) || a.localeCompare(b)).map(tool => {
    const models = ring.models.filter(model => model.tool === tool), known = models.filter(model => model.cost !== null)
    return { tool, models, tokens: models.reduce((sum, model) => sum + model.tokens, 0), cost: known.length ? known.reduce((sum, model) => sum + model.cost!, 0) : null, missingEstimates: models.reduce((sum, model) => sum + model.missingEstimates, 0) }
  })
}
function ring(rows: UsageMetadataRecord[], key: string, kind: UsageRing['kind'], origin: DeviceUsageOrigin | undefined): UsageRing {
  const estimated = rows.filter(r => r.costSource !== 'unknown')
  const platforms = new Set(rows.map(r => r.platform))
  const groups = new Map<string, UsageMetadataRecord[]>()
  for (const row of rows) { const id = `${row.tool}\0${row.provider}\0${row.model}`; if (!groups.has(id)) groups.set(id, []); groups.get(id)!.push(row) }
  return { ...usageTotals(rows), key, kind, platform: platforms.size === 1 ? rows[0].platform : 'unknown', source: kind === 'total' ? 'aggregate' : origin?.source ?? 'imported', importedAt: origin?.importedAt ?? null, share: null,
    estimatedCost: estimated.length ? estimated.reduce((n, r) => n + r.cost, 0) : null, missingEstimates: rows.length - estimated.length,
    models: [...groups.values()].map(items => ({ tool: items[0].tool, provider: items[0].provider, model: items[0].model, tokens: items.reduce((n, r) => n + usageTokens(r), 0), cost: items.some(r => r.costSource !== 'unknown') ? items.reduce((n, r) => n + (r.costSource === 'unknown' ? 0 : r.cost), 0) : null, missingEstimates: items.filter(r => r.costSource === 'unknown').length })).sort((a, b) => b.tokens - a.tokens || a.model.localeCompare(b.model)) }
}
/** Same calendar/filter semantics as UsageOverview. Devices with older data remain visible with a genuine zero. */
export function buildUsageRings(records: UsageMetadataRecord[], currentDeviceKey: string, period: UsagePeriod, origins: Map<string, DeviceUsageOrigin>, device?: string, project?: string, now = new Date()): UsageRingsSnapshot {
  const since = usageSince(period, now), until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
  const history = records.filter(r => r.ts < until && (!device || r.deviceKey === device) && (!project || (r.projectKey ?? 'unknown') === project))
  const rows = history.filter(r => r.ts >= since), grouped = new Map<string, UsageMetadataRecord[]>(), deviceTools = new Map<string, Set<string>>()
  for (const row of history) {
    if (!grouped.has(row.deviceKey)) grouped.set(row.deviceKey, [])
    if (!deviceTools.has(row.deviceKey)) deviceTools.set(row.deviceKey, new Set())
    deviceTools.get(row.deviceKey)!.add(row.tool)
  }
  if (!device || device === currentDeviceKey) grouped.set(currentDeviceKey, grouped.get(currentDeviceKey) ?? [])
  for (const row of rows) grouped.get(row.deviceKey)!.push(row)
  const total = ring(rows, 'total', 'total', undefined)
  const devices = [...grouped].map(([key, values]) => {
    const result = ring(values, key, 'device', origins.get(key) ?? (key === currentDeviceKey ? { source: 'local', importedAt: null } : undefined))
    result.toolNames = [...(deviceTools.get(key) ?? [])].sort()
    if (!values.length) { const previous = history.find(r => r.deviceKey === key); result.platform = previous?.platform ?? 'unknown' }
    result.share = total.tokens > 0 ? result.tokens / total.tokens : null
    return result
  }).sort((a, b) => Number(b.key === currentDeviceKey) - Number(a.key === currentDeviceKey) || a.key.localeCompare(b.key))
  return { version: 1, period, since, until, generatedAt: now.getTime(), currentDeviceKey, metric: 'observed-device-token-share', total, devices, syncConfigured: false }
}
