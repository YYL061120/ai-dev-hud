import { describe, it, expect } from 'vitest'
import { normalizeCodexRateLimits, normalizeClaudeStatusline, subscriptionRingWindow, subscriptionWindowState, SUBSCRIPTION_FRESHNESS_MS } from '../src/subscription-usage.js'
import { buildUsageRings, ringToolUsage } from '../src/usage-rings.js'
const now = 1_800_000_000_000
describe('official account subscription observations', () => {
  it('prefers multiple buckets, preserves their identity and actual windows without assuming slot durations', () => {
    const value = normalizeCodexRateLimits({ rateLimits: { primary: { usedPercent: 99 } }, rateLimitsByLimitId: {
      codex: { limitName: 'Codex', primary: { usedPercent: 12, windowDurationMins: 15, resetsAt: (now + 1000) / 1000 }, secondary: { usedPercent: 34, windowDurationMins: 10080 } },
      other: { primary: { usedPercent: 88, windowDurationMins: 10080 } },
    } }, now)
    expect(value.windows).toHaveLength(3)
    expect(value).toMatchObject({ scope: 'account-shared', source: 'codex-app-server', observedAt: now })
    expect(value.windows[0]).toMatchObject({ bucketId: 'codex', bucketName: 'Codex', durationMinutes: 15, resetsAt: now + 1000 })
    expect(subscriptionRingWindow(value)?.usedPercent).toBe(34)
    expect(subscriptionRingWindow(normalizeCodexRateLimits({ rateLimitsByLimitId: { x: { primary: { usedPercent: 1 } }, y: { primary: { usedPercent: 2 } } } }))).toBeUndefined()
  })
  it('accepts legitimate zero, rejects null/invalid percentages and becomes stale at reset or after freshness', () => {
    for (const percentage of [null, '0', NaN, -1, 101]) {
      const value = normalizeCodexRateLimits({ rateLimits: { primary: { usedPercent: percentage } } }, now)
      expect(subscriptionWindowState(value, value.windows[0], now)).toBe('unknown')
    }
    const value = normalizeCodexRateLimits({ rateLimits: { primary: { usedPercent: 0, resetsAt: (now + 1000) / 1000 } } }, now)
    expect(subscriptionWindowState(value, value.windows[0], now)).toBe('available')
    expect(subscriptionWindowState(value, value.windows[0], now + 1000)).toBe('stale')
    expect(subscriptionWindowState(value, value.windows[0], now + SUBSCRIPTION_FRESHNESS_MS + 1)).toBe('stale')
    expect(subscriptionWindowState({ ...value, observedAt: now + 60_000 }, value.windows[0], now)).toBe('stale')
  })
  it('uses only Claude subscription fields, tolerates missing windows and ignores gateway spend/context/cost', () => {
    const value = normalizeClaudeStatusline({ context_window: { used_percentage: 99 }, cost: { total_cost_usd: 20 }, rate_limits: { seven_day: { used_percentage: 42, resets_at: (now + 1000) / 1000 }, spend_limit: { used_percentage: 100, period: 'monthly' } }, secret: 'never-retained' }, now)
    expect(value.windows).toEqual([{ bucketId: 'claude', bucketName: null, slot: 'seven_day', durationMinutes: 10080, usedPercent: 42, resetsAt: now + 1000 }])
    expect(JSON.stringify(value)).not.toMatch(/secret|context|cost|spend_limit/)
    expect(normalizeClaudeStatusline({ context_window: { used_percentage: 100 } }).windows).toEqual([])
  })
  it('does not invent zero-dollar costs for tracked tools without collected estimates', () => {
    const empty = buildUsageRings([], 'local', 'today', new Map())
    expect(ringToolUsage(empty.devices[0], ['codex', 'claude-code']).map(group => [group.tokens, group.cost])).toEqual([[0, null], [0, null]])
  })
})
