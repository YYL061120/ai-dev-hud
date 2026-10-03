import type http from 'node:http'
import path from 'node:path'
import { isLoopbackHost } from './trust.js'
import { AIUSAGE_DIR } from '../config.js'
import { ProjectRegistry, discoverProjects, inspectProject, kickoff, LocalControlError, readProjectDocument } from '../local-control/projects.js'
import { codexStatus, launchCodex } from '../local-control/launcher.js'
import type { UsageMetadataStore } from '../local-control/usage.js'
import { UsageExportJobs } from '../local-control/usage-export.js'
import { codexMetadataStatus } from '../local-control/session-metadata.js'
import { readSubscriptions } from '../local-control/subscriptions.js'
export async function boundedJson(req: http.IncomingMessage, maximum = 16 * 1024): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new LocalControlError('JSON content type required', 415)
  const chunks: Buffer[] = []; let bytes = 0
  for await (const chunk of req) { const buffer = Buffer.from(chunk); bytes += buffer.length; if (bytes > maximum) throw new LocalControlError('Request too large', 413); chunks.push(buffer) }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value
  } catch { throw new LocalControlError('Invalid JSON') }
}
export const reply = (res: http.ServerResponse, body: unknown, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)) }
export function createLocalControlHandler(registry = new ProjectRegistry(path.join(AIUSAGE_DIR, 'projects.json')), usage?: () => UsageMetadataStore, runWrite: <T>(task: () => T | Promise<T>) => Promise<T> = async task => task()) {
  const exports = new UsageExportJobs()
  return async (req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> => {
    if (!url.pathname.startsWith('/api/local/')) return false
    res.setHeader('Cache-Control', 'no-store')
    try {
      // Even a password-enabled remotely bound dashboard cannot operate this computer's project files/launcher.
      const remote = req.socket.remoteAddress?.replace(/^::ffff:/, '') ?? ''
      if (!isLoopbackHost(remote) || !isLoopbackHost(new URL(`http://${req.headers.host}`).hostname)) throw new LocalControlError('Local computer access required', 403)
      const route = url.pathname.slice('/api/local/'.length)
      if (route.startsWith('usage')) {
        if (!usage) throw new LocalControlError('Usage service unavailable', 503)
        const store = usage()
        const exportRoute = /^usage\/export-jobs\/([a-f0-9-]{36})(?:\/(file|cancel))?$/.exec(route)
        if (route === 'usage/export-jobs' && req.method === 'POST') { await boundedJson(req); reply(res, exports.start()) }
        else if (exportRoute && !exportRoute[2] && req.method === 'GET') reply(res, exports.status(exportRoute[1]))
        else if (exportRoute?.[2] === 'file' && req.method === 'GET') await exports.download(exportRoute[1], store, res)
        else if (exportRoute?.[2] === 'cancel' && req.method === 'POST') { await boundedJson(req); reply(res, exports.cancel(exportRoute[1])) }
        else if (route === 'usage' && req.method === 'GET') {
          const period = url.searchParams.get('period') ?? 'thirty'
          if (!['today', 'seven', 'thirty', 'lifetime'].includes(period)) throw new LocalControlError('Invalid usage period')
          const device = url.searchParams.get('device') || undefined, project = url.searchParams.get('project') || undefined
          if ((device && !/^[a-f0-9]{64}$/.test(device)) || (project && project !== 'unknown' && !/^[a-f0-9]{64}$/.test(project))) throw new LocalControlError('Invalid metadata filter')
          const ringPeriods = url.searchParams.get('ringPeriods')
          if (ringPeriods !== null && ringPeriods !== 'all') throw new LocalControlError('Invalid ring periods')
          const overview = store.overview(period, device, project, undefined, ringPeriods === 'all')
          const subscriptions = await readSubscriptions()
          overview.rings.subscriptions = subscriptions
          for (const snapshot of Object.values(overview.ringPeriods ?? {})) snapshot.subscriptions = subscriptions
          overview.projectLabels = Object.fromEntries((await registry.list()).map(item => [store.projectKeyFor(item.path), item.name]))
          reply(res, overview)
        } else if (route === 'usage/export' && req.method === 'GET') {
          const transfer = store.export()
          res.setHeader('Content-Disposition', 'attachment; filename="ai-dev-hud-usage-metadata-v1.json"')
          reply(res, transfer)
        } else if (route === 'usage/import' && req.method === 'POST') {
          const transfer = await boundedJson(req, 10 * 1024 * 1024)
          reply(res, await runWrite(() => store.import(transfer)))
        } else throw new LocalControlError('Method not allowed', 405)
      }
      else if (route === 'projects' && req.method === 'GET') reply(res, { projects: await registry.list() })
      else if (route === 'projects' && req.method === 'POST') reply(res, { project: await registry.register((await boundedJson(req)).path) })
      else if (route === 'discover' && req.method === 'POST') reply(res, await discoverProjects((await boundedJson(req)).path))
      else if (route === 'codex' && req.method === 'GET') reply(res, await codexStatus())
      else {
        const match = /^projects\/([^/]+)(?:\/(document|kickoff|launch))?$/.exec(route)
        if (!match) throw new LocalControlError('Endpoint not found', 404)
        const project = await registry.get(match[1])
        if (!match[2] && req.method === 'DELETE') { await registry.unregister(project.id); reply(res, { ok: true }) }
        else if (!match[2] && req.method === 'GET') { const inspection = await inspectProject(project); inspection.recentSession = await codexMetadataStatus(); reply(res, inspection) }
        else if (match[2] === 'document' && req.method === 'GET') reply(res, await readProjectDocument(project, url.searchParams.get('key') ?? ''))
        else if (match[2] === 'kickoff' && req.method === 'POST') { const body = await boundedJson(req); reply(res, kickoff(await inspectProject(project), String(body.task), String(body.language))) }
        else if (match[2] === 'launch' && req.method === 'POST') { const body = await boundedJson(req); if (body.confirm !== true) throw new LocalControlError('Explicit launch confirmation required'); reply(res, await launchCodex(project.path)) }
        else throw new LocalControlError('Method not allowed', 405)
      }
    } catch (error) { if (res.headersSent) res.destroy(); else reply(res, { error: { code: 'LOCAL_CONTROL', message: error instanceof LocalControlError ? error.message : 'Local operation failed; existing files were preserved' } }, error instanceof LocalControlError ? error.status : 500) }
    return true
  }
}
