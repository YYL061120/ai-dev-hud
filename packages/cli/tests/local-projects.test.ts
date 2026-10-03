import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { ProjectRegistry, discoverProjects, inspectProject, kickoff, readProjectDocument } from '../src/local-control/projects.js'
import { launchScript } from '../src/local-control/launcher.js'
import { createLocalControlHandler } from '../src/api/local-control.js'

let root: string
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), 'hud-projects-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
describe('explicit local project context', () => {
  it('deduplicates concurrent registrations and unregisters without deleting project files', async () => {
    const dir = path.join(root, 'project'); await mkdir(dir); await writeFile(path.join(dir, 'keep.txt'), 'KEEP')
    const registry = new ProjectRegistry(path.join(root, 'registry.json'))
    const results = await Promise.all([registry.register(dir), registry.register(dir)])
    expect(results[0].id).toBe(results[1].id); expect(await registry.list()).toHaveLength(1)
    await registry.unregister(results[0].id)
    expect(await registry.list()).toEqual([]); expect(await readFile(path.join(dir, 'keep.txt'), 'utf8')).toBe('KEEP')
  })
  it('preserves corrupt registry rather than overwriting it', async () => {
    const filename = path.join(root, 'registry.json'); await writeFile(filename, 'bad')
    await expect(new ProjectRegistry(filename).register(root)).rejects.toThrow('preserved')
    expect(await readFile(filename, 'utf8')).toBe('bad')
  })
  it('detects Unity, Unreal and Git within bounded discovery, skips links and dependencies', async () => {
    await mkdir(path.join(root, 'unity', 'Assets'), { recursive: true }); await mkdir(path.join(root, 'unreal')); await writeFile(path.join(root, 'unreal', 'Game.uproject'), '{}')
    await mkdir(path.join(root, 'git', '.git'), { recursive: true }); await mkdir(path.join(root, 'node_modules', 'hidden', 'Assets'), { recursive: true })
    await mkdir(path.join(root, 'a', 'b', 'c', 'd', 'Assets'), { recursive: true })
    await symlink(path.join(root, 'unity'), path.join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir')
    const found = await discoverProjects(root)
    expect(found.projects.map(p => p.engine).sort()).toEqual(['other', 'unity', 'unreal'])
    expect(found.projects.some(p => p.path.includes('node_modules') || p.path.includes('alias'))).toBe(false)
    for (let i = 0; i < 205; i++) await mkdir(path.join(root, `extra-${i}`))
    const bounded = await discoverProjects(root); expect(bounded.visited).toBeLessThanOrEqual(200); expect(bounded.truncated).toBe(true)
  })
  it('reads allowlisted convention documents and refuses linked/oversized documents', async () => {
    await mkdir(path.join(root, 'project', 'docs'), { recursive: true }); await mkdir(path.join(root, 'outside'))
    await writeFile(path.join(root, 'project', 'AGENTS.md'), 'local conventions'); await writeFile(path.join(root, 'project', 'docs', 'ARCHITECTURE.md'), 'x'.repeat(65537))
    await writeFile(path.join(root, 'outside', 'PROJECT_STATE.md'), 'PRIVATE')
    const registry = new ProjectRegistry(path.join(root, 'registry.json')); const project = await registry.register(path.join(root, 'project'))
    expect((await readProjectDocument(project, 'agents')).content).toBe('local conventions')
    await expect(readProjectDocument(project, '../outside')).rejects.toThrow()
    await expect(readProjectDocument(project, 'architecture')).rejects.toThrow()
    await rm(path.join(root, 'project', 'docs'), { recursive: true }); await symlink(path.join(root, 'outside'), path.join(root, 'project', 'docs'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(readProjectDocument(project, 'state')).rejects.toThrow('unavailable')
  })
  it('reports actual branch and dirty state without changing the repository', async () => {
    const dir = path.join(root, 'git'); await mkdir(dir)
    execFileSync('git', ['init', '-b', 'feature', dir], { windowsHide: true })
    await writeFile(path.join(dir, 'file.txt'), 'test')
    execFileSync('git', ['-C', dir, 'add', 'file.txt'], { windowsHide: true })
    execFileSync('git', ['-C', dir, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture'], { windowsHide: true })
    const project = await new ProjectRegistry(path.join(root, 'registry.json')).register(dir)
    const clean = await inspectProject(project); expect(clean.git.branch).toBe('feature'); expect(clean.git.dirty).toBe(false)
    await writeFile(path.join(dir, 'file.txt'), 'changed')
    const dirty = await inspectProject(project); expect(dirty.git.dirty).toBe(true)
    for (const task of ['continue', 'feature', 'debug', 'architecture', 'review', 'new-project']) { const preview = kickoff(dirty, task, 'zh'); expect(preview.autoSubmit).toBe(false); expect(preview.cwd).toBe(dir) }
    await expect(Promise.resolve().then(() => kickoff(dirty, 'exec', 'en'))).rejects.toThrow('Unknown')
  })
  it('quotes Windows launch paths as literals and passes no prompt or exec subcommand', () => {
    const script = launchScript('C:\\Official\\codex.exe', "C:\\Projects\\O'Brien & $(whoami)")
    expect(script).toBe("Start-Process -FilePath 'C:\\Official\\codex.exe' -WorkingDirectory 'C:\\Projects\\O''Brien & $(whoami)'")
    expect(script).not.toMatch(/ArgumentList|--dangerously|\bexec\b/)
  })
  it('requires registered projects and explicit launch acknowledgement over HTTP', async () => {
    const registry = new ProjectRegistry(path.join(root, 'registry.json'))
    const handler = createLocalControlHandler(registry)
    const server = createServer((req, res) => { void handler(req, res, new URL(req.url!, 'http://localhost')) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(server.address() as any).port}/api/local`
    try {
      const project = await registry.register(root)
      expect((await fetch(`${url}/projects/${project.id}/launch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(400)
      expect((await fetch(`${url}/projects/nonexistent/launch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"confirm":true}' })).status).toBe(404)
      expect((await fetch(`${url}/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: 'x'.repeat(17000) }) })).status).toBe(413)
    } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  })
})
