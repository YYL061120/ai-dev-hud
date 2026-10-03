import { describe, it, expect } from 'vitest'
import { aggregateUsage, validateUsageTransfer, usageSince, type UsageMetadataRecord, type UsageMetadataTransfer } from '../src/usage-metadata.js'
const row = (ts: number, overrides: Partial<UsageMetadataRecord> = {}): UsageMetadataRecord => ({ deviceKey: 'a'.repeat(64), recordKey: 'b'.repeat(64), sessionKey: 'c'.repeat(64), projectKey: 'd'.repeat(64), ts, updatedAt: ts, tool: 'codex', model: 'gpt-4o', provider: 'openai', platform: 'win32', inputTokens: 100, outputTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 3, thinkingTokens: 2, cost: 0.04, costSource: 'pricing', ...overrides })
const transfer = (): UsageMetadataTransfer => ({ format: 'ai-dev-hud-usage', version: 1, exportedAt: 1, records: [row(1)] })
describe('sanitized usage metadata domain', () => {
  it('accepts the complete versioned contract and rejects content/path fields', () => {
    expect(validateUsageTransfer(transfer()).records).toHaveLength(1)
    for (const key of ['prompt', 'response', 'sourceFile', 'cwd', 'credentials', 'content']) {
      const value: any = transfer(); value.records[0][key] = 'PRIVATE'
      expect(() => validateUsageTransfer(value)).toThrow('Invalid usage metadata')
    }
    expect(() => validateUsageTransfer({ ...transfer(), version: 2 })).toThrow()
    expect(() => validateUsageTransfer({ ...transfer(), records: Array(50001).fill(row(1)) })).toThrow()
    expect(() => validateUsageTransfer({ ...transfer(), credentials: 'secret' })).toThrow()
  })
  it('rejects unsafe counts, timestamps, identifiers and missing keys', () => {
    for (const invalid of [{ inputTokens: -1 }, { inputTokens: 1.5 }, { cost: Infinity }, { ts: NaN }, { model: 'C:\\Users\\PRIVATE' }, { deviceKey: 'host-name' }, { platform: 'secret' }, { tool: 'unrecognized' }]) {
      const value: any = transfer(); Object.assign(value.records[0], invalid); expect(() => validateUsageTransfer(value)).toThrow()
    }
    const value: any = transfer(); delete value.records[0].sessionKey; expect(() => validateUsageTransfer(value)).toThrow()
  })
  it('uses calendar rolling windows including today and excludes the next day', () => {
    const now = new Date(2026, 9, 3, 12)
    const ts = (days: number) => new Date(2026, 9, 3 - days, 12).getTime()
    const rows = [row(ts(0)), row(ts(6), { recordKey: 'e'.repeat(64) }), row(ts(7)), row(ts(29)), row(ts(30)), row(ts(-1))]
    const stats = aggregateUsage(rows, 'a'.repeat(64), 'seven', undefined, undefined, now)
    expect(stats.periods.today.records).toBe(1); expect(stats.periods.seven.records).toBe(2); expect(stats.periods.thirty.records).toBe(4); expect(stats.periods.lifetime.records).toBe(5)
    expect(stats.selected.tokens).toBe(260); expect(stats.selected.sessions).toBe(1); expect(stats.heatmap).toHaveLength(2)
    expect(usageSince('seven', now)).toBe(new Date(2026, 8, 27).getTime())
    expect(() => usageSince('week')).toThrow()
  })
  it('groups model/device/project and distinct device-scoped sessions with filters', () => {
    const ts = new Date(2026, 9, 3, 12).getTime()
    const other = row(ts, { deviceKey: 'e'.repeat(64), projectKey: null, model: 'gpt-5' })
    const all = aggregateUsage([row(ts), other], 'a'.repeat(64), 'today', undefined, undefined, new Date(ts))
    expect(all.devices).toHaveLength(2); expect(all.models).toHaveLength(2); expect(all.projects.some(p => p.key === 'unknown')).toBe(true); expect(all.selected.sessions).toBe(2)
    expect(aggregateUsage([row(ts), other], 'a'.repeat(64), 'today', 'e'.repeat(64), 'unknown', new Date(ts)).selected.tokens).toBe(130)
  })
})
