import type http from 'node:http'
import path from 'node:path'
import { isLoopbackHost } from './trust.js'
import { AIUSAGE_DIR } from '../config.js'
import { ProjectRegistry, discoverProjects, inspectProject, kickoff, LocalControlError, readProjectDocument } from '../local-control/projects.js'
import { codexStatus, launchCodex } from '../local-control/launcher.js'
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
export function createLocalControlHandler(registry = new ProjectRegistry(path.join(AIUSAGE_DIR, 'projects.json'))) {
  return async (req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> => {
    if (!url.pathname.startsWith('/api/local/')) return false
    try {
      // Even a password-enabled remotely bound dashboard cannot operate this computer's project files/launcher.
      const remote = req.socket.remoteAddress?.replace(/^::ffff:/, '') ?? ''
      if (!isLoopbackHost(remote) || !isLoopbackHost(new URL(`http://${req.headers.host}`).hostname)) throw new LocalControlError('Local computer access required', 403)
      const route = url.pathname.slice('/api/local/'.length)
      if (route === 'projects' && req.method === 'GET') reply(res, { projects: await registry.list() })
      else if (route === 'projects' && req.method === 'POST') reply(res, { project: await registry.register((await boundedJson(req)).path) })
      else if (route === 'discover' && req.method === 'POST') reply(res, await discoverProjects((await boundedJson(req)).path))
      else if (route === 'codex' && req.method === 'GET') reply(res, await codexStatus())
      else {
        const match = /^projects\/([^/]+)(?:\/(document|kickoff|launch))?$/.exec(route)
        if (!match) throw new LocalControlError('Endpoint not found', 404)
        const project = await registry.get(match[1])
        if (!match[2] && req.method === 'DELETE') { await registry.unregister(project.id); reply(res, { ok: true }) }
        else if (!match[2] && req.method === 'GET') reply(res, await inspectProject(project))
        else if (match[2] === 'document' && req.method === 'GET') reply(res, await readProjectDocument(project, url.searchParams.get('key') ?? ''))
        else if (match[2] === 'kickoff' && req.method === 'POST') { const body = await boundedJson(req); reply(res, kickoff(await inspectProject(project), String(body.task), String(body.language))) }
        else if (match[2] === 'launch' && req.method === 'POST') { const body = await boundedJson(req); if (body.confirm !== true) throw new LocalControlError('Explicit launch confirmation required'); reply(res, await launchCodex(project.path)) }
        else throw new LocalControlError('Method not allowed', 405)
      }
    } catch (error) { reply(res, { error: { code: 'LOCAL_CONTROL', message: error instanceof LocalControlError ? error.message : 'Local operation failed; existing files were preserved' } }, error instanceof LocalControlError ? error.status : 500) }
    return true
  }
}
