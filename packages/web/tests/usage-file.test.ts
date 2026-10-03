import { describe, it, expect } from 'vitest'
import { importUsageFile } from '../src/lib/usage-file'
const header = { format: 'ai-dev-hud-usage-chunks', version: 1, type: 'header', exportedAt: 1 }
const record = { deviceKey: 'a'.repeat(64), recordKey: 'b'.repeat(64), projectKey: null, sessionKey: null, ts: 1, updatedAt: 1, tool: 'codex', model: 'gpt-4o', provider: 'openai', platform: 'win32', inputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0, cost: 0, costSource: 'pricing' }
const chunk = { format: 'ai-dev-hud-usage', version: 1, exportedAt: 1, records: [record] }
const footer = (chunks: number, records = chunks) => ({ format: 'ai-dev-hud-usage-chunks', version: 1, type: 'complete', chunks, records })
const file = (...lines: unknown[]) => new File([lines.map(line => JSON.stringify(line)).join('\n') + '\n'], 'fixture.jsonl')
const added = async () => ({ added: 1, updated: 0, duplicates: 0, conflicts: 0 })
describe('streaming metadata file import', () => {
  it('accepts complete chunks and legacy version-1 JSON', async () => {
    const progress: number[] = []
    const result = await importUsageFile(file(header, chunk, chunk, footer(2)), added, () => false, p => progress.push(p.records))
    expect(result).toMatchObject({ state: 'complete', records: 2, chunks: 2, result: { added: 2 } }); expect(progress).toContain(1)
    expect((await importUsageFile(new File([JSON.stringify(chunk)], 'old.json'), added, () => false, () => {})).state).toBe('complete')
  })
  it('never marks missing, mismatched or followed footer files complete, and reports the acknowledged prefix', async () => {
    for (const input of [file(header, chunk), file(header, chunk, footer(2)), file(header, chunk, footer(1), chunk)]) {
      expect(await importUsageFile(input, added, () => false, () => {})).toMatchObject({ state: 'failed', records: 1, chunks: 1, result: { added: 1 } })
    }
  })
  it('cancels between acknowledged batches, keeps their counts, and marks uncertain responses', async () => {
    let cancelled = false
    const result = await importUsageFile(file(header, chunk, chunk, footer(2)), async () => { cancelled = true; return added() }, () => cancelled, () => {})
    expect(result).toMatchObject({ state: 'cancelled', records: 1, chunks: 1, result: { added: 1 } })
    let calls = 0
    const failed = await importUsageFile(file(header, chunk, chunk, footer(2)), async () => { if (++calls === 2) throw new Error('Connection lost'); return added() }, () => false, () => {})
    expect(failed).toMatchObject({ state: 'failed', records: 1, uncertain: true })
  })
  it('bounds lines and rejects private fields / URL credentials before any chunk is sent', async () => {
    let calls = 0; const send = async () => { calls++; return added() }
    for (const invalid of [new File(['x'.repeat(2 * 1024 * 1024 + 1)], 'too-large.jsonl'), file(header, { ...chunk, records: [{ ...record, prompt: 'private' }] }), file(header, { ...chunk, records: [{ ...record, provider: 'https://name:secret@host' }] })]) {
      expect((await importUsageFile(invalid, send, () => false, () => {})).state).toBe('failed')
    }
    expect(calls).toBe(0)
  })
  it('accepts an empty complete container but rejects unknown header fields', async () => {
    expect((await importUsageFile(file(header, footer(0)), added, () => false, () => {})).state).toBe('complete')
    expect((await importUsageFile(file({ ...header, prompt: 'private' }, footer(0)), added, () => false, () => {})).state).toBe('failed')
  })
})
