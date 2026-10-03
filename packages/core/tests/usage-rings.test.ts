import { describe, it, expect } from 'vitest'
import { buildUsageRings, ringToolUsage } from '../src/usage-rings.js'
import type { UsageMetadataRecord } from '../src/usage-metadata.js'
const now = new Date(2026, 9, 3, 12), today = new Date(2026, 9, 3).getTime()
const row = (key: string, tokens: number, extra: Partial<UsageMetadataRecord> = {}): UsageMetadataRecord => ({ deviceKey: key, recordKey: key, projectKey: null, sessionKey: key, ts: today, updatedAt: today, tool: 'codex', model: 'gpt-4o', provider: 'openai', platform: 'win32', inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0, cost: 0, costSource: 'unknown', ...extra })
describe('observed device token rings', () => {
  it('uses the same period denominator, exact token sums and device-scoped session counts', () => {
    const data = buildUsageRings([row('a', 30), row('b', 70)], 'a', 'today', new Map(), undefined, undefined, now)
    expect(data.total.tokens).toBe(100); expect(data.total.sessions).toBe(2); expect(data.total.share).toBeNull()
    expect(data.devices.map(d => d.share)).toEqual([.3, .7]); expect(data.metric).toBe('observed-device-token-share')
  })
  it('keeps zero-history and older devices without pretending quota or connectivity', () => {
    const empty = buildUsageRings([], 'a', 'today', new Map(), undefined, undefined, now)
    expect(empty.devices).toHaveLength(1); expect(empty.devices[0]).toMatchObject({ tokens: 0, share: null, source: 'local', estimatedCost: null })
    const data = buildUsageRings([row('b', 20, { ts: today - 1 })], 'a', 'today', new Map([['b', { source: 'imported', importedAt: null }]]), undefined, undefined, now)
    expect(data.devices[1]).toMatchObject({ tokens: 0, share: null, source: 'imported', importedAt: null })
  })
  it('excludes tomorrow and respects device/project filters and local calendar ranges', () => {
    const rows = [row('a', 30, { projectKey: 'p' }), row('b', 70), row('b', 5, { ts: today + 86400000 }), row('b', 10, { ts: today - 86400000 })]
    expect(buildUsageRings(rows, 'a', 'today', new Map(), undefined, undefined, now).total.tokens).toBe(100)
    expect(buildUsageRings(rows, 'a', 'seven', new Map(), undefined, undefined, now).total.tokens).toBe(110)
    expect(buildUsageRings(rows, 'a', 'today', new Map(), 'a', 'p', now).total.tokens).toBe(30)
  })
  it('reports missing and partial estimates while retaining provider/tool/model identity', () => {
    const rows = [row('a', 30), row('a', 20, { tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-6', costSource: 'pricing', cost: .2 })]
    const data = buildUsageRings(rows, 'a', 'today', new Map(), undefined, undefined, now)
    expect(data.total).toMatchObject({ estimatedCost: .2, missingEstimates: 1 })
    expect(data.total.models[0]).toMatchObject({ provider: 'openai', cost: null }); expect(data.total.models[1]).toMatchObject({ tool: 'claude-code', cost: .2 })
  })
  it('retains same-name models across tools and providers, with partial costs and every token category', () => {
    const data = buildUsageRings([
      row('a', 10, { outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4, thinkingTokens: 5, cost: 0, costSource: 'pricing' }),
      row('a', 20, { provider: 'other', cost: 0, costSource: 'unknown' }),
      row('a', 30, { tool: 'claude-code', provider: 'anthropic', cost: .3, costSource: 'pricing' }),
    ], 'a', 'today', new Map(), undefined, undefined, now)
    const groups = ringToolUsage(data.devices[0])
    expect(groups.map(group => group.tool)).toEqual(['claude-code', 'codex'])
    expect(groups[1]).toMatchObject({ tokens: 44, cost: 0, missingEstimates: 1 })
    expect(groups[1].models).toHaveLength(2)
    expect(groups[1].models.map(model => model.provider).sort()).toEqual(['openai', 'other'])
    expect(groups.reduce((sum, group) => sum + group.tokens, 0)).toBe(data.devices[0].tokens)
  })
})
