import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { createDatabase } from '../src/db/index.js'
import { UsageMetadataStore } from '../src/local-control/usage.js'
import { createApiServer } from '../src/api/server.js'
const database = () => createDatabase(path.join(mkdtempSync(path.join(tmpdir(), 'hud-large-')), 'fixture.db'))
function seed(db: Database.Database, size = 60_123) {
  db.prepare(`WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<?)
    INSERT INTO records(id,ts,ingested_at,updated_at,line_offset,tool,model,provider,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,thinking_tokens,cost,cost_source,session_id,source_file,cwd,device,device_instance_id,platform,origin)
    SELECT 'PRIVATE_ROW_'||n, ?, ?, ?, 1, 'codex','gpt-4o','openai',100,20,0,0,0,0.01,'pricing','PRIVATE_SESSION','C:\\PRIVATE_SOURCE','C:\\PRIVATE_PROJECT','PRIVATE_HOST','fixture-device','win32','local' FROM seq`).run(size, Date.now(), Date.now(), Date.now())
}
describe('bounded large history transfer', () => {
  it('exports beyond old limits in bounded chunks, keeps a WAL snapshot and imports idempotently across store instances', () => {
    const source = database(), target = database()
    try {
      seed(source)
      const store = new UsageMetadataStore(source, 'fixture-device')
      expect(() => store.export()).toThrow('Legacy JSON limit')
      const stream = store.exportChunks(), first = stream.next().value!
      expect(first.records).toHaveLength(1000)
      source.prepare("UPDATE records SET input_tokens=999 WHERE id='PRIVATE_ROW_60123'").run()
      let count = 0, bytes = 0, chunks = 0
      for (const part of (function* () { yield first; yield* stream })()) {
        expect(part.records.length).toBeLessThanOrEqual(1000)
        const text = JSON.stringify(part); expect(text).not.toMatch(/PRIVATE_|source_file|cwd|prompt/)
        count += part.records.length; bytes += Buffer.byteLength(text); chunks++
        const importing = new UsageMetadataStore(target, 'target-device')
        expect(importing.import(part).added).toBe(part.records.length)
        expect(new UsageMetadataStore(target, 'target-device').import(part).duplicates).toBe(part.records.length)
        if (count === 60_123) expect(part.records.at(-1)!.inputTokens).toBe(100)
      }
      expect(count).toBe(60_123); expect(chunks).toBe(61); expect(bytes).toBeGreaterThan(10 * 1024 * 1024)
      expect((target.prepare('SELECT COUNT(*) AS n FROM hud_usage_metadata').get() as any).n).toBe(count)
      // Returning our own chunks must use local authority, including rows changed since the snapshot.
      let duplicates = 0
      for (const part of store.exportChunks()) duplicates += new UsageMetadataStore(source, 'fixture-device').import(part).duplicates
      expect(duplicates).toBe(count)
      expect((source.prepare('SELECT COUNT(*) AS n FROM hud_usage_metadata').get() as any).n).toBe(0)
    } finally { source.close(); target.close() }
  }, 30_000)
  it('invalidates the hashed local index after parser writes and releases an interrupted snapshot', () => {
    const db = database()
    try {
      seed(db, 2001); const store = new UsageMetadataStore(db, 'fixture-device')
      const stream = store.exportChunks(), first = stream.next().value!
      stream.return(undefined)
      db.prepare("DELETE FROM records WHERE id='PRIVATE_ROW_1'").run()
      expect(store.import({ ...first, records: [first.records[0]] }).added).toBe(1)
      seed(db, 1)
      expect(store.import({ ...first, records: [first.records[0]] }).duplicates).toBe(1)
      expect([...store.exportChunks()].reduce((n, p) => n + p.records.length, 0)).toBe(2001)
    } finally { db.close() }
  })
  it('streams a complete container, remains responsive between chunks, supports cancel and protects job routes', async () => {
    const db = database(); seed(db)
    const server = createApiServer(db, { currentDeviceInstanceId: 'fixture-device' })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as any).port}/api/local/usage/export-jobs`
    const post = (url: string, origin?: string) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: '{}' })
    try {
      expect((await post(base, 'https://untrusted.invalid')).status).toBe(403)
      const pending = await (await post(base)).json()
      expect((await post(base)).status).toBe(409)
      expect((await post(`${base}/${pending.id}/cancel`)).status).toBe(200)
      expect((await fetch(`${base}/${pending.id}/file`)).status).toBe(409)
      const job = await (await post(base)).json(), response = await fetch(`${base}/${job.id}/file`)
      expect(response.headers.get('content-disposition')).toContain('.jsonl')
      const reader = response.body!.getReader(); let text = '', responsive = false
      while (true) {
        const part = await reader.read(); if (part.done) break
        text += new TextDecoder().decode(part.value)
        if (!responsive && text.includes('ai-dev-hud-usage\"')) {
          const status = await (await fetch(`${base}/${job.id}`)).json(); expect(status.state).toMatch(/running|complete/); responsive = true
        }
      }
      const lines = text.trim().split('\n').map(line => JSON.parse(line))
      expect(lines[0].type).toBe('header'); expect(lines.at(-1)).toMatchObject({ type: 'complete', chunks: 61, records: 60_123 })
      expect((await (await fetch(`${base}/${job.id}`)).json()).state).toBe('complete'); expect(responsive).toBe(true)
      const cancelling = await (await post(base)).json(), interrupted = await fetch(`${base}/${cancelling.id}/file`)
      const interruptedReader = interrupted.body!.getReader(); await interruptedReader.read()
      expect((await (await post(`${base}/${cancelling.id}/cancel`)).json()).state).toBe('cancelled')
      await interruptedReader.cancel()
      expect((await (await fetch(`${base}/${cancelling.id}`)).json()).state).toBe('cancelled')
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close() }
  }, 30_000)
})
