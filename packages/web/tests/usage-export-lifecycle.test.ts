import { describe, it, expect, vi } from 'vitest'
import { beginUsageExport } from '../src/lib/usage-export-lifecycle'
import type { UsageExportProgress } from '../../core/src/usage-transfer.js'
const pending: UsageExportProgress = { id: 'fixture-job', state: 'pending', records: 0, chunks: 0 }
const fixture = () => {
  let resolve!: (value: UsageExportProgress) => void
  const api = { startExport: vi.fn(() => new Promise<UsageExportProgress>(done => resolve = done)), cancelExport: vi.fn(async id => ({ ...pending, id, state: 'cancelled' as const })) }
  return { api, resolve: () => resolve(pending), publish: vi.fn(), download: vi.fn() }
}
describe('export creation lifecycle', () => {
  it('cancels a delayed creation after page destruction without triggering a download', async () => {
    const f = fixture(); let mounted = true
    const result = beginUsageExport(f.api, () => !mounted, f.publish, f.download)
    mounted = false; f.resolve()
    expect(await result).toBeUndefined(); expect(f.download).not.toHaveBeenCalled()
    expect(f.api.cancelExport).toHaveBeenCalledOnce(); expect(f.api.cancelExport).toHaveBeenCalledWith(pending.id)
    expect(f.publish).toHaveBeenLastCalledWith({ ...pending, state: 'cancelled' })
  })
  it('honors cancellation while the creation response is pending', async () => {
    const f = fixture(); let cancel = false
    const result = beginUsageExport(f.api, () => cancel, f.publish, f.download)
    cancel = true; f.resolve()
    expect(await result).toBeUndefined(); expect(f.download).not.toHaveBeenCalled(); expect(f.api.cancelExport).toHaveBeenCalledWith(pending.id)
  })
  it('does not start an export after the lifecycle already stopped', async () => {
    const f = fixture()
    expect(await beginUsageExport(f.api, () => true, f.publish, f.download)).toBeUndefined()
    expect(f.api.startExport).not.toHaveBeenCalled(); expect(f.download).not.toHaveBeenCalled()
  })
  it('starts one normal download and does not cancel a live page', async () => {
    const f = fixture(); const result = beginUsageExport(f.api, () => false, f.publish, f.download); f.resolve()
    expect(await result).toBe(pending.id); expect(f.download).toHaveBeenCalledOnce(); expect(f.api.cancelExport).not.toHaveBeenCalled()
  })
  it('surfaces cancellation errors while preventing download', async () => {
    const f = fixture(); let stop = false
    f.api.cancelExport.mockRejectedValueOnce(new Error('Cancel unavailable'))
    const result = beginUsageExport(f.api, () => stop, f.publish, f.download); stop = true; f.resolve()
    await expect(result).rejects.toThrow('Cancel unavailable'); expect(f.download).not.toHaveBeenCalled()
  })
})
