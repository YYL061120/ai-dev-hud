import { safeUsageIdentifier } from './usage-metadata.js'

/** Official window observations; scope is stated by the source. Never a device allocation or token budget. */
export interface SubscriptionWindow {
  bucketId: string; bucketName: string | null; slot: string
  durationMinutes: number | null; usedPercent: number | null; resetsAt: number | null
}
export interface ToolSubscription {
  /** Opaque observation generation; session-observed data never proves an account login. */
  generation?: string | null
  validUntil?: number
  tool: string; scope: 'account-shared' | 'session-observed'; source: 'codex-app-server' | 'claude-statusline'
  reason?: import('./claude-integration.js').ClaudeObservationReason
  observedAt: number; windows: SubscriptionWindow[]
}
export const SUBSCRIPTION_FRESHNESS_MS = 5 * 60_000
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
function window(value: unknown, bucketId: string, bucketName: string | null, slot: string, duration?: number): SubscriptionWindow | null {
  const row = object(value)
  if (!Object.keys(row).length) return null
  const percent = row.usedPercent ?? row.used_percentage, reset = row.resetsAt ?? row.resets_at, minutes = duration ?? row.windowDurationMins
  return { bucketId, bucketName, slot, usedPercent: finite(percent) && percent >= 0 && percent <= 100 ? percent : null,
    durationMinutes: finite(minutes) && minutes > 0 ? minutes : null,
    resetsAt: finite(reset) && reset > 0 && reset < 8.64e12 ? reset * 1000 : null }
}
/** Multi-bucket response takes precedence; bucket IDs are not model identifiers. */
export function normalizeCodexRateLimits(value: unknown, observedAt = Date.now()): ToolSubscription {
  const payload = object(value), buckets = object(payload.rateLimitsByLimitId), single = object(payload.rateLimits)
  // Reject the observation rather than collapse distinct unsafe identities into a shared sentinel.
  if (Object.keys(buckets).length ? Object.keys(buckets).some(id => safeUsageIdentifier(id) !== id) : typeof single.limitId === 'string' && safeUsageIdentifier(single.limitId) !== single.limitId) return { tool: 'codex', scope: 'account-shared', source: 'codex-app-server', observedAt, windows: [] }
  const entries = Object.keys(buckets).length ? Object.entries(buckets) : Object.keys(single).length ? [[typeof single.limitId === 'string' ? single.limitId : 'codex', single] as const] : []
  const windows = entries.flatMap(([id, value]) => {
    const row = object(value), name = typeof row.limitName === 'string' ? safeUsageIdentifier(row.limitName) : null
    return ['primary', 'secondary'].flatMap(slot => { const result = window(row[slot], safeUsageIdentifier(id), name, slot); return result ? [result] : [] })
  })
  return { tool: 'codex', scope: 'account-shared', source: 'codex-app-server', observedAt, windows }
}
/** Only rate_limits are consumed. Context-window percentages and cost are deliberately ignored. */
export function normalizeClaudeStatusline(value: unknown, observedAt = Date.now()): ToolSubscription {
  const payload = object(object(value).rate_limits)
  const windows = [['five_hour', 300], ['seven_day', 10080]].flatMap(([slot, minutes]) => {
    const result = window(payload[String(slot)], 'claude', null, String(slot), Number(minutes)); return result ? [result] : []
  })
  return { tool: 'claude-code', scope: 'account-shared', source: 'claude-statusline', observedAt, windows }
}
export function subscriptionWindowState(subscription: ToolSubscription | undefined, window: SubscriptionWindow | undefined, now = Date.now(), currentGeneration?: string | null): 'available' | 'stale' | 'unknown' {
  if (!subscription?.generation || !currentGeneration || subscription.generation !== currentGeneration) return 'unknown'
  if (!subscription || !window || window.usedPercent === null) return 'unknown'
  if (subscription.validUntil !== undefined && (!Number.isFinite(subscription.validUntil) || subscription.validUntil <= now)) return 'stale'
  if (!Number.isFinite(subscription.observedAt) || subscription.observedAt > now + 30_000 || now - subscription.observedAt > SUBSCRIPTION_FRESHNESS_MS || window.resetsAt !== null && window.resetsAt <= now) return 'stale'
  return 'available'
}
/** One tool ring uses its general weekly/longest window, never adds independent buckets. */
export function subscriptionRingWindow(subscription: ToolSubscription | undefined): SubscriptionWindow | undefined {
  if (!subscription) return undefined
  const buckets = new Set(subscription.windows.map(window => window.bucketId))
  const general = subscription.windows.filter(window => window.bucketId === (subscription.tool === 'codex' ? 'codex' : 'claude'))
  const candidates = general.length ? general : buckets.size === 1 ? subscription.windows : []
  return [...candidates].sort((a, b) => (b.durationMinutes ?? 0) - (a.durationMinutes ?? 0))[0]
}
