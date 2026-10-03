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
  it('exports only allowlisted metadata without paths, hostname or raw identifiers', () => {
    const store = new UsageMetadataStore(db, 'local-device-instance'); const transfer = store.export(); const text = JSON.stringify(transfer)
    expect(text).not.toMatch(/PRIVATE_|sourceFile|source_file|cwd|hostname|lineOffset/)
    expect(transfer.records[0].deviceKey).toBe(deviceKeyFor('local-device-instance')); expect(transfer.records[0].projectKey).toMatch(/^[a-f0-9]{64}$/)
    expect(store.import(transfer)).toEqual({ added: 0, updated: 0, duplicates: 1, conflicts: 0 }); expect(store.overview().selected.tokens).toBe(120)
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
