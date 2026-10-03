import type http from 'node:http'
import { randomUUID } from 'node:crypto'
import { setImmediate as yieldTurn } from 'node:timers/promises'
import { once } from 'node:events'
import type { UsageExportProgress } from '@aiusage/core'
import { USAGE_CHUNK_LINE_BYTES } from '@aiusage/core'
import type { UsageMetadataStore } from './usage.js'
import { LocalControlError } from './projects.js'
interface Job { progress: UsageExportProgress; controller: AbortController; created: number }
/** Jobs contain counters only. No exports, paths, prompts or database rows are retained in memory. */
export class UsageExportJobs {
  private jobs = new Map<string, Job>()
  private get(id: string) {
    const job = this.jobs.get(id)
    if (!job) throw new LocalControlError('Export job expired; start a new export', 404)
    if (job.progress.state === 'pending' && Date.now() - job.created > 10 * 60_000) job.progress.state = 'failed'
    return job
  }
  start(): UsageExportProgress {
    for (const [id, job] of this.jobs) {
      if (job.progress.state === 'pending' && Date.now() - job.created > 10 * 60_000) job.progress.state = 'failed'
      if (Date.now() - job.created > 30 * 60_000 && job.progress.state !== 'running') this.jobs.delete(id)
    }
    if ([...this.jobs.values()].some(j => ['pending', 'running'].includes(j.progress.state))) throw new LocalControlError('An export is already active; finish or cancel it first', 409)
    while (this.jobs.size >= 8) this.jobs.delete(this.jobs.keys().next().value!)
    const progress: UsageExportProgress = { id: randomUUID(), state: 'pending', chunks: 0, records: 0 }
    this.jobs.set(progress.id, { progress, controller: new AbortController(), created: Date.now() })
    return { ...progress }
  }
  status(id: string) { return { ...this.get(id).progress } }
  cancel(id: string) {
    const job = this.get(id)
    if (['pending', 'running'].includes(job.progress.state)) { job.progress.state = 'cancelled'; job.controller.abort() }
    return { ...job.progress }
  }
  async download(id: string, store: UsageMetadataStore, res: http.ServerResponse) {
    const job = this.get(id)
    if (job.progress.state !== 'pending') throw new LocalControlError('Export file can be downloaded once; start a new export to retry', 409)
    job.progress.state = 'running'
    const { signal } = job.controller
    const stop = () => job.controller.abort()
    res.once('close', stop)
    const timeout = setTimeout(stop, 10 * 60_000); timeout.unref()
    const writeLine = async (value: unknown) => {
      signal.throwIfAborted()
      const line = JSON.stringify(value) + '\n'
      if (Buffer.byteLength(line) > USAGE_CHUNK_LINE_BYTES) throw new Error('Chunk size exceeded')
      if (!res.write(line)) await once(res, 'drain', { signal })
    }
    try {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Content-Disposition': 'attachment; filename="ai-dev-hud-usage-metadata-v1.jsonl"', 'Cache-Control': 'no-store' })
      await writeLine({ format: 'ai-dev-hud-usage-chunks', version: 1, type: 'header', exportedAt: Date.now() })
      for (const chunk of store.exportChunks()) {
        await writeLine(chunk)
        job.progress.records += chunk.records.length; job.progress.chunks++
        await yieldTurn(undefined, { signal })
      }
      await writeLine({ format: 'ai-dev-hud-usage-chunks', version: 1, type: 'complete', chunks: job.progress.chunks, records: job.progress.records })
      // "complete" means the response finished, not merely that its last chunk was queued.
      const finished = once(res, 'finish', { signal })
      res.end(); await finished
      job.progress.state = 'complete'
    } catch {
      job.progress.state = signal.aborted ? 'cancelled' : 'failed'
      job.progress.message = signal.aborted ? 'Export interrupted; the file is incomplete' : 'Export failed; the file is incomplete and must be retried'
      res.destroy()
    } finally { clearTimeout(timeout); res.removeListener('close', stop) }
  }
}
