import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type http from 'node:http'
import { createDatabase } from '../src/db/index.js'
import { insertRecord } from '../src/db/records.js'
import { UsageMetadataStore, deviceKeyFor } from '../src/local-control/usage.js'
import { createApiServer } from '../src/api/server.js'
import type { StatsRecord } from '@aiusage/core'
let db: Database.Database
const fixture = (): StatsRecord => ({ id: 'PRIVATE_SOURCE_ID', ts: Date.now(), ingestedAt: Date.now(), updatedAt: Date.now(), lineOffset: 1, tool: 'codex', model: 'gpt-4o', provider: 'openai', inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0, cost: 0.01, costSource: 'pricing', sessionId: 'PRIVATE_SESSION', sourceFile: 'C:\\PRIVATE_USER\\rollout-private.jsonl', cwd: 'C:\\PRIVATE_USER\\Secret Project', device: 'PRIVATE_HOSTNAME', deviceInstanceId: 'local-device-instance', platform: 'win32', origin: 'local' })
beforeEach(() => { db = createDatabase(':memory:'); insertRecord(db, fixture()) })
afterEach(() => { db.close(); vi.unstubAllEnvs() })
describe('local metadata storage adapter', () => {
  it('repairs historic today Codex priced zeros without changing the DB or imported prices', () => {
    db.prepare('UPDATE records SET model=?, input_tokens=1000, output_tokens=100, cache_read_tokens=800, thinking_tokens=40, cost=0, cost_source=?').run('gpt-6.1-sol', 'pricing')
    const store = new UsageMetadataStore(db, 'local-device-instance'), today = store.overview('today')
    expect(today.rings.total.models[0]).toMatchObject({ tokens: 1940, missingEstimates: 0 })
    expect(today.rings.total.models[0].cost).toBeCloseTo(.00148)
    expect(today.selected.estimatedCost).toBeCloseTo(.00148)
    expect(db.prepare('SELECT cost FROM records').get()).toEqual({ cost: 0 })
    const foreign = store.export(); foreign.records[0].deviceKey = 'e'.repeat(64); foreign.records[0].recordKey = 'f'.repeat(64); foreign.records[0].cost = 123
    store.import(foreign)
    expect(store.overview('today').rings.devices.find(r => r.key === 'e'.repeat(64))!.models[0].cost).toBe(123)
    db.prepare('UPDATE records SET model=?').run('codex-auto-review')
    expect(store.overview('today').rings.devices.find(r => r.key === today.currentDeviceKey)!.models[0]).toMatchObject({ cost: null, missingEstimates: 1 })
  })
  it('exposes consistent device rings, real import receipts and unknown historic receipt times without changing exports', () => {
    const store = new UsageMetadataStore(db, 'local-device-instance'), foreign = store.export()
    foreign.records[0].deviceKey = 'e'.repeat(64); foreign.records[0].recordKey = 'f'.repeat(64)
    store.import(foreign)
    const overview = store.overview('today')
    expect(overview.rings!.total.tokens).toBe(overview.selected.tokens)
    expect(overview.rings!.devices.reduce((n, r) => n + r.tokens, 0)).toBe(overview.selected.tokens)
    const imported = overview.rings!.devices.find(r => r.key === 'e'.repeat(64))!
    expect(imported.source).toBe('imported'); expect(imported.importedAt).toBeGreaterThan(0); expect(imported.share).toBe(.5)
    const all = store.overview('today', undefined, undefined, undefined, true).ringPeriods!
    expect(Object.keys(all)).toEqual(['today', 'seven', 'thirty', 'lifetime'])
    expect(new Set(Object.values(all).map(r => r.generatedAt)).size).toBe(1)
    expect(store.import(foreign).duplicates).toBe(1); expect(store.overview('today').selected.tokens).toBe(240)
    db.exec('DROP TABLE hud_usage_import_receipts')
    expect(store.overview('today').rings!.devices.find(r => r.key === imported.key)!.importedAt).toBeNull()
    expect(store.export().records[1]).not.toHaveProperty('importedAt')
  })
  it('exports only allowlisted metadata without paths, hostname or raw identifiers', () => {
    const store = new UsageMetadataStore(db, 'local-device-instance'); const transfer = store.export(); const text = JSON.stringify(transfer)
    expect(text).not.toMatch(/PRIVATE_|sourceFile|source_file|cwd|hostname|lineOffset/)
    expect(transfer.records[0].deviceKey).toBe(deviceKeyFor('local-device-instance')); expect(transfer.records[0].projectKey).toMatch(/^[a-f0-9]{64}$/)
    expect(store.import(transfer)).toEqual({ added: 0, updated: 0, duplicates: 1, conflicts: 0 }); expect(store.overview().selected.tokens).toBe(120)
  })
  it('normalizes synthetic provider/model credential URLs and rejects them on import without storing credentials', () => {
    const synthetic = 'https://fixture-user:fixture-secret@private.example/v1'
    insertRecord(db, { ...fixture(), provider: synthetic, model: synthetic })
    const store = new UsageMetadataStore(db, 'local-device-instance'); const transfer = store.export()
    expect(transfer.records[0].provider).toBe('unknown'); expect(transfer.records[0].model).toBe('unknown')
    expect(JSON.stringify(transfer)).not.toContain('fixture-secret'); expect(store.overview().selected.tokens).toBe(120)
    const invalid: any = structuredClone(transfer); invalid.records[0].provider = synthetic; invalid.records[0].deviceKey = 'e'.repeat(64)
    expect(() => store.import(invalid)).toThrow('Invalid version 1'); expect(store.export().records).toHaveLength(1)
    for (const field of ['platform', 'costSource']) { const invalid: any = structuredClone(transfer); invalid.records[0][field] = [field === 'platform' ? 'win32' : 'pricing']; expect(() => store.import(invalid)).toThrow('Invalid version 1') }
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='hud_usage_metadata'").get()).toBeUndefined()
  })
  it('deduplicates imports, updates newer rows and flags equal-version conflicts', () => {
    const store = new UsageMetadataStore(db, 'local-device-instance'); const transfer = store.export()
    transfer.records[0].deviceKey = 'e'.repeat(64); transfer.records[0].recordKey = 'f'.repeat(64)
    expect(store.import(transfer).added).toBe(1); expect(store.import(transfer).duplicates).toBe(1); expect(store.overview().selected.tokens).toBe(240)
    const reordered = JSON.parse(JSON.stringify(transfer)); reordered.records[0] = Object.fromEntries(Object.entries(reordered.records[0]).reverse())
    expect(store.import(reordered).duplicates).toBe(1)
    transfer.records[0].inputTokens = 200; expect(store.import(transfer).conflicts).toBe(1); expect(store.overview().selected.tokens).toBe(240)
    transfer.records[0].updatedAt++; expect(store.import(transfer).updated).toBe(1); expect(store.overview().selected.tokens).toBe(340)
    expect(new UsageMetadataStore(db, 'local-device-instance').overview().devices).toHaveLength(2)
  })
  it('rejects the entire invalid batch before modifying import storage', () => {
    const store = new UsageMetadataStore(db, 'local-device-instance'); const transfer: any = store.export(); transfer.records[0].deviceKey = 'e'.repeat(64)
    transfer.records.push({ ...transfer.records[0], recordKey: 'f'.repeat(64), prompt: 'PRIVATE PROMPT' })
    expect(() => store.import(transfer)).toThrow('Invalid version 1'); expect(store.overview().selected.tokens).toBe(120)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='hud_usage_metadata'").get()).toBeUndefined()
  })
  it('keeps local parser records authoritative after importing a record back before parsing', () => {
    const store = new UsageMetadataStore(db, 'local-device-instance'); const transfer = store.export()
    db.prepare('DELETE FROM records').run(); expect(store.import(transfer).added).toBe(1)
    insertRecord(db, { ...fixture(), inputTokens: 150 }); expect(store.overview().selected.tokens).toBe(170); expect(store.export().records).toHaveLength(1)
  })
  it('maps pre-initialization local rows to the existing stable device ID and excludes synced parser rows', () => {
    db.prepare("UPDATE records SET device_instance_id='unknown'").run(); insertRecord(db, { ...fixture(), id: 'synced-copy', origin: 'synced' })
    const store = new UsageMetadataStore(db, 'local-device-instance'); expect(store.export().records).toHaveLength(1); expect(store.export().records[0].deviceKey).toBe(deviceKeyFor('local-device-instance'))
  })
  it('protects metadata/project APIs with password and same-origin gates, validates filters and transfer', async () => {
    vi.stubEnv('AIUSAGE_DASHBOARD_PASSWORD', 'fixture-password')
    const server: http.Server = createApiServer(db, { currentDeviceInstanceId: 'local-device-instance' }); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as any).port}`
    try {
      expect((await fetch(base + '/api/local/projects')).status).toBe(401); expect((await fetch(base + '/api/local/usage/export')).status).toBe(401)
      const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"fixture-password"}' })
      const cookie = login.headers.get('set-cookie')!.split(';')[0]
      expect((await fetch(base + '/api/local/usage', { headers: { Cookie: cookie, Origin: 'https://attacker.invalid' } })).status).toBe(403)
      expect((await fetch(base + '/api/local/usage?device=raw-hostname', { headers: { Cookie: cookie } })).status).toBe(400)
      expect((await fetch(base + '/api/local/usage?period=week', { headers: { Cookie: cookie } })).status).toBe(400)
      const exported = await fetch(base + '/api/local/usage/export', { headers: { Cookie: cookie } }); expect(exported.status).toBe(200); expect(exported.headers.get('content-disposition')).toContain('attachment')
      const value = await exported.json(); const imported = await fetch(base + '/api/local/usage/import', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); expect(imported.status).toBe(200); expect((await imported.json()).duplicates).toBe(1)
    } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  })
})
