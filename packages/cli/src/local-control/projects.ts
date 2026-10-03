import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PROJECT_TASKS, type LocalProject, type ProjectTask, type ProjectInspection, type ProjectDocument, type ProjectDiscovery } from '@aiusage/core'

const exec = promisify(execFile)
const DOCUMENTS = { agents: ['AGENTS.md'], state: ['docs/PROJECT_STATE.md', 'PROJECT_STATE.md'], architecture: ['docs/ARCHITECTURE.md', 'ARCHITECTURE.md'] } as const
const SKIP = new Set(['.git', 'node_modules', 'Library', 'Temp', 'Build', 'Binaries', 'Intermediate', '.aiusage', '.codex'])
export class LocalControlError extends Error { constructor(message: string, public status = 400) { super(message) } }
const equalPath = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value

export async function canonicalDirectory(value: unknown): Promise<string> {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.length > 2048 || /[\x00-\x1f]/.test(value)) throw new LocalControlError('Enter an absolute local directory')
  const root = await fs.realpath(value).catch(() => { throw new LocalControlError('Directory is unavailable') })
  if (!(await fs.stat(root)).isDirectory() || root === path.parse(root).root || root.startsWith('\\\\')) throw new LocalControlError('Choose a local project directory, not a drive or network root')
  return root
}

export class ProjectRegistry {
  private pending: Promise<unknown> = Promise.resolve()
  constructor(private filename: string) {}
  async list(): Promise<LocalProject[]> {
    try {
      const doc = JSON.parse(await fs.readFile(this.filename, 'utf8'))
      if (doc.version !== 1 || !Array.isArray(doc.projects)) throw new Error('Invalid registry')
      return doc.projects
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw new LocalControlError('Project registry is unreadable; existing data was preserved', 500)
    }
  }
  private mutate<T>(operation: (projects: LocalProject[]) => T): Promise<T> {
    const run = this.pending.then(async () => {
      const projects = await this.list()
      const result = operation(projects)
      await fs.mkdir(path.dirname(this.filename), { recursive: true, mode: 0o700 })
      const temporary = `${this.filename}.${randomUUID()}.tmp`
      await fs.writeFile(temporary, JSON.stringify({ version: 1, projects }, null, 2), { mode: 0o600 })
      await fs.rename(temporary, this.filename)
      return result
    })
    this.pending = run.catch(() => {})
    return run
  }
  async register(value: unknown): Promise<LocalProject> {
    const root = await canonicalDirectory(value)
    return this.mutate(projects => {
      const existing = projects.find(p => equalPath(p.path) === equalPath(root))
      if (existing) return existing
      if (projects.length >= 200) throw new LocalControlError('Registry limit is 200 projects')
      const project = { id: randomUUID(), name: path.basename(root), path: root, registeredAt: Date.now() }
      projects.push(project)
      return project
    })
  }
  async unregister(id: string): Promise<void> {
    await this.mutate(projects => { const index = projects.findIndex(p => p.id === id); if (index >= 0) projects.splice(index, 1) })
  }
  async get(id: string): Promise<LocalProject> {
    const project = (await this.list()).find(p => p.id === id)
    if (!project) throw new LocalControlError('Project is not registered', 404)
    return project
  }
}

async function directoryEntries(root: string) {
  // opendir avoids allocating an unbounded listing from a huge explicit directory.
  const entries = []
  const dir = await fs.opendir(root)
  for await (const entry of dir) { entries.push(entry); if (entries.length >= 1000) break }
  return entries
}
async function markers(root: string) {
  const entries = await directoryEntries(root)
  const ordinary = entries.filter(e => !e.isSymbolicLink())
  const engine = ordinary.some(e => e.name === 'Assets' && e.isDirectory()) ? 'unity' : ordinary.some(e => /\.uproject$/i.test(e.name) && e.isFile()) ? 'unreal' : 'other'
  return { entries, engine: engine as ProjectInspection['engine'], project: ordinary.some(e => e.name === '.git' || e.name === 'AGENTS.md' || e.name === 'PROJECT_STATE.md' || e.name === 'ARCHITECTURE.md') || engine !== 'other' }
}

async function documentAt(root: string, relative: string): Promise<boolean> {
  const filename = path.join(root, relative)
  try {
    // Refuse every symlink/junction component, even one pointing elsewhere in this project.
    let current = root
    for (const part of relative.split('/')) { current = path.join(current, part); if ((await fs.lstat(current)).isSymbolicLink()) return false }
    const resolved = await fs.realpath(filename)
    const rel = path.relative(root, resolved)
    const stat = await fs.stat(filename)
    return !rel.startsWith('..') && !path.isAbsolute(rel) && stat.isFile() && stat.size <= 64 * 1024
  } catch { return false }
}
export async function inspectProject(project: LocalProject): Promise<ProjectInspection> {
  const result: ProjectInspection = { ...project, available: false, engine: 'other', git: { present: false, branch: null, dirty: null }, documents: [], recentSession: { available: false, reason: 'unsupported-metadata-interface' } }
  try {
    const root = await canonicalDirectory(project.path)
    if (equalPath(root) !== equalPath(project.path)) throw new Error('Registered directory moved')
    const found = await markers(root)
    result.available = true; result.engine = found.engine
    for (const [key, candidates] of Object.entries(DOCUMENTS)) {
      let relative: string = candidates[0]
      for (const candidate of candidates) if (await documentAt(root, candidate)) { relative = candidate; break }
      result.documents.push({ key: key as ProjectDocument['key'], path: relative, available: await documentAt(root, relative) })
    }
    result.git.present = found.entries.some(e => e.name === '.git' && !e.isSymbolicLink())
    if (result.git.present) {
      const args = ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-C', root]
      const options = { windowsHide: true, timeout: 5000, maxBuffer: 256 * 1024 }
      try {
        const branch = await exec('git', [...args, 'rev-parse', '--abbrev-ref', 'HEAD'], options)
        const status = await exec('git', [...args, 'status', '--porcelain', '-z', '--untracked-files=normal'], options)
        result.git.branch = branch.stdout.trim(); result.git.dirty = status.stdout.length > 0
      } catch { result.git.error = 'Git status unavailable (ownership, unborn branch, or command failure)' }
    }
  } catch { /* Keep missing projects visible so users can unregister them. */ }
  return result
}
export async function readProjectDocument(project: LocalProject, key: string): Promise<{ path: string; content: string }> {
  if (!(key in DOCUMENTS) || !Object.hasOwn(DOCUMENTS, key)) throw new LocalControlError('Unknown project document')
  const root = await canonicalDirectory(project.path)
  if (equalPath(root) !== equalPath(project.path)) throw new LocalControlError('Registered directory moved')
  for (const relative of DOCUMENTS[key as keyof typeof DOCUMENTS]) if (await documentAt(root, relative)) {
    const file = await fs.open(path.join(root, relative), 'r')
    try {
      const stat = await file.stat()
      if (stat.size > 64 * 1024) throw new LocalControlError('Document is too large')
      const buffer = Buffer.alloc(64 * 1024 + 1)
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
      if (bytesRead > 64 * 1024) throw new LocalControlError('Document is too large')
      return { path: relative, content: buffer.subarray(0, bytesRead).toString('utf8') }
    } finally { await file.close() }
  }
  throw new LocalControlError('Document unavailable, linked, or larger than 64 KiB', 404)
}
export async function discoverProjects(value: unknown): Promise<ProjectDiscovery> {
  const root = await canonicalDirectory(value)
  const result: ProjectDiscovery = { projects: [], visited: 0, truncated: false }
  const queue = [{ root, depth: 0 }]
  while (queue.length && result.visited < 200) {
    const item = queue.shift()!; result.visited++
    try {
      const found = await markers(item.root)
      if (found.entries.length >= 1000) result.truncated = true
      if (found.project) result.projects.push({ path: item.root, name: path.basename(item.root), engine: found.engine })
      if (item.depth < 3) for (const entry of found.entries) if (entry.isDirectory() && !entry.isSymbolicLink() && !SKIP.has(entry.name)) {
        if (queue.length + result.visited < 200) queue.push({ root: path.join(item.root, entry.name), depth: item.depth + 1 })
        else result.truncated = true
      }
    } catch { /* Permission denied or vanished directories are not followed. */ }
  }
  return result
}
export function kickoff(project: ProjectInspection, task: string, language: string) {
  if (!(PROJECT_TASKS as readonly string[]).includes(task)) throw new LocalControlError('Unknown task type')
  const zh = language === 'zh'
  const actions = zh ? ['继续项目：先阅读状态并提出下一步。', '新功能：先澄清目标和验收，再实施。', '调试：复现问题，确认原因并验证修复。', '架构：检查现有实现，先提出方案再改结构。', '代码审查：检查正确性、风险与遗漏测试。', '新项目规划：明确目标、技术与目录；不要自动创建引擎工程。'] : ['Continue this project: read its state and propose next steps.', 'New feature: clarify requirements and acceptance before implementation.', 'Debug: reproduce, identify the cause, and verify the fix.', 'Architecture: inspect implementation and propose a plan before structural changes.', 'Code review: inspect correctness, risks, and missing tests.', 'Plan a new project: agree on goals, technology, and directory; do not create engine projects automatically.']
  const files = project.documents.filter(d => d.available).map(d => d.path).join(', ') || (zh ? '无约定文档' : 'No convention documents')
  return { task: task as ProjectTask, cwd: project.path, autoSubmit: false as const, prompt: `${actions[PROJECT_TASKS.indexOf(task as ProjectTask)]}\n${zh ? '工作目录' : 'Working directory'}: ${project.path}\n${zh ? '引擎 / 分支' : 'Engine / branch'}: ${project.engine} / ${project.git.branch ?? '?'}\n${zh ? '先阅读项目约定' : 'Read project conventions first'}: ${files}\n${zh ? '不要直接在 main 开发；修改前检查已有实现，完成后更新项目状态并运行相关测试。' : 'Do not develop directly on main. Inspect existing implementation, update project state, and run relevant tests.'}` }
}
