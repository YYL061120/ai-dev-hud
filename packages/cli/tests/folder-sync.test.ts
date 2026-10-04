import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, readdir, readFile, writeFile, rename, symlink, lstat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { createDatabase } from '../src/db/index.js'
import { insertRecord } from '../src/db/records.js'
import { FolderSyncController, safeSyncDirectory } from '../src/local-control/folder-sync.js'
import { UsageMetadataStore, deviceKeyFor } from '../src/local-control/usage.js'
import type { StatsRecord } from '@aiusage/core'

let root: string, shared: string, dbs: Database.Database[], controllers: FolderSyncController[]
const record = (id: string, input = 100): StatsRecord => ({ id: 'PRIVATE_RECORD', ts: Date.now(), ingestedAt: Date.now(), updatedAt: Date.now(), lineOffset: 1, tool: 'claude-code', model: 'claude-sonnet-4', provider: 'anthropic', inputTokens: input, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0, cost: .01, costSource: 'log', sessionId: 'PRIVATE_SESSION', sourceFile: 'PRIVATE_LOG', cwd: 'C:\\PRIVATE_PROJECT', device: 'PRIVATE_HOSTNAME', deviceInstanceId: id, platform: 'win32', origin: 'local' })
function node(id: string, binding = id, collect?: () => Promise<unknown>) {
  const db = createDatabase(join(root, `${randomUUID()}.db`)); dbs.push(db)
  const controller = new FolderSyncController({ db, deviceId: id, binding, collect }); controllers.push(controller)
  return { db, controller, store: new UsageMetadataStore(db, id) }
}
async function enable(c: FolderSyncController) { await c.configure(shared, true, true); await c.syncNow() }
function writer(db: Database.Database): string { return JSON.parse((db.prepare("SELECT value FROM hud_folder_sync_state WHERE key='settings'").get() as {value:string}).value).writer }
async function batchFile(device: string, edit: (lines: any[]) => any[]) {
  const names = (await readdir(shared)).filter(n => n.startsWith(deviceKeyFor(device)) && n.endsWith('.jsonl'))
  let name = ''
  for (const candidate of names) if ((await readFile(join(shared,candidate),'utf8')).trim().split('\n').length === 3) { name = candidate; break }
  const values = (await readFile(join(shared,name),'utf8')).trim().split('\n').map(s => JSON.parse(s))
  const foreign = edit(values)
  const newName = name.replace(/([a-f0-9-]{36})\.jsonl$/, `${randomUUID()}.jsonl`)
  await writeFile(join(shared,newName), foreign.map(v => JSON.stringify(v)).join('\n')+'\n')
  return newName
}
beforeEach(async () => { root = await mkdtemp(join(tmpdir(),'ai-hud-folder-sync-')); shared = join(root,'Shared Drive with spaces'); await mkdir(shared); dbs=[]; controllers=[] })
afterEach(async () => { for (const c of controllers) c.stop(); for (const c of controllers) await c.drain(); for (const db of dbs) db.close(); vi.useRealTimers(); vi.unstubAllEnvs(); await rm(root,{recursive:true,force:true}) })

describe('isolated folder metadata transport', () => {
  it('defaults off and requires explicit directory consent; never writes raw fields', async () => {
    const a=node('a'); insertRecord(a.db,record('a'))
    expect(a.controller.status().enabled).toBe(false); await a.controller.syncNow(); expect(await readdir(shared)).toEqual([])
    await expect(a.controller.configure(shared,true,false)).rejects.toThrow('确认')
    await enable(a.controller)
    const names=await readdir(shared); expect(names.every(n=>n.endsWith('.jsonl'))).toBe(true)
    const text=(await Promise.all(names.map(n=>readFile(join(shared,n),'utf8')))).join('')
    expect(text).not.toMatch(/PRIVATE_|sourceFile|cwd|hostname|quota|snapshot|email|credential|prompt|response|directory/)
    expect(text).toContain('complete'); expect(a.controller.status().lastSuccessAt).toBeGreaterThan(0)
  })
  it('three synthetic nodes converge, repeat safely, update old records, and never re-export imports', async () => {
    const a=node('a'), b=node('b'), mac=node('mac')
    insertRecord(a.db,record('a',100)); insertRecord(b.db,record('b',200)); insertRecord(mac.db,{...record('mac',300),platform:'darwin'})
    await Promise.all([enable(a.controller),enable(b.controller),enable(mac.controller)])
    await Promise.all([a.controller.syncNow(),b.controller.syncNow(),mac.controller.syncNow()])
    for (const n of [a,b,mac]) expect(n.store.overview('lifetime').selected.tokens).toBe(600)
    const count=(await readdir(shared)).length; await Promise.all([a.controller.syncNow(),b.controller.syncNow()]); expect((await readdir(shared)).length).toBe(count)
    const prior=record('mac',350); prior.updatedAt+=1000; insertRecord(mac.db,prior)
    await mac.controller.syncNow(); await b.controller.syncNow(); expect(b.store.overview('lifetime').selected.tokens).toBe(650)
    expect(b.controller.status().devices).toHaveLength(3)
    for (const name of await readdir(shared)) {
      const lines=(await readFile(join(shared,name),'utf8')).trim().split('\n').map(s=>JSON.parse(s))
      for (const line of lines) if (Array.isArray(line.records)) expect(line.records.every((r:any)=>name.startsWith(r.deviceKey))).toBe(true)
    }
  })
  it('paused state survives restart; re-enabling resumes increments and offline recovery', async () => {
    const a=node('a'); insertRecord(a.db,record('a')); await enable(a.controller)
    await a.controller.configure(undefined,false,true)
    const restart=new FolderSyncController({db:a.db,deviceId:'a',binding:'a'}); controllers.push(restart); expect(restart.status().enabled).toBe(false)
    insertRecord(a.db,record('a',150)); const before=(await readdir(shared)).length; await restart.syncNow(); expect((await readdir(shared)).length).toBe(before)
    await enable(restart)
    const offline=join(root,'offline'); await rename(shared,offline); await restart.syncNow(); expect(restart.status().error).toContain('不可用')
    const success=restart.status().lastSuccessAt; await rename(offline,shared); await restart.syncNow(); expect(restart.status().error).toBeNull(); expect(restart.status().lastSuccessAt).toBeGreaterThanOrEqual(success!)
  })
  it('rejects traversal, symlink/junction directories and symlink files without reading targets', async () => {
    const a=node('a'), b=node('b'); const other=join(root,'Other'); await mkdir(other)
    await expect(safeSyncDirectory(join(shared,'..','Other')+'\\..')).rejects.toThrow()
    const link=join(root,'redirected'); await symlink(shared,link,process.platform==='win32'?'junction':'dir')
    await expect(a.controller.configure(link,true,true)).rejects.toThrow('symlink')
    await expect(safeSyncDirectory(join(link,'child'))).rejects.toThrow()
    insertRecord(a.db,record('a')); await enable(a.controller)
    let name = ''
    for (const candidate of await readdir(shared)) if ((await readFile(join(shared,candidate),'utf8')).trim().split('\n').length === 3) { name=candidate; break }
    const target=join(other,'external.jsonl'); await rename(join(shared,name),target)
    // Windows file symlinks may require elevated privileges; a directory junction
    // named as a batch exercises the same lstat rejection without those privileges.
    await symlink(other,join(shared,name),process.platform==='win32'?'junction':'dir')
    await enable(b.controller); expect(b.store.overview().selected.tokens).toBe(0); expect(b.controller.status().issues.length).toBeGreaterThan(0)
    expect((await lstat(target)).isFile()).toBe(true)
  })
  it('isolates unknown fields, incomplete files, oversized batches and safe conflict copies', async () => {
    const a=node('a'), b=node('b'); insertRecord(a.db,record('a')); await enable(a.controller)
    const names=await readdir(shared); let dataName = ''
    for (const candidate of names) if ((await readFile(join(shared,candidate),'utf8')).trim().split('\n').length === 3) { dataName = candidate; break }
    const text=await readFile(join(shared,dataName),'utf8')
    await writeFile(join(shared,dataName.replace('.jsonl',' conflict copy.jsonl')),text)
    await batchFile('a',lines=>{ if(lines[1].records) lines[1].records[0].prompt='PRIVATE_PROMPT'; else lines[0].extra=true; return lines })
    await writeFile(join(shared,`${deviceKeyFor('evil')}.${randomUUID()}.${randomUUID()}.jsonl`),'x'.repeat(5*1024*1024))
    await writeFile(join(shared,`${deviceKeyFor('partial')}.${randomUUID()}.${randomUUID()}.jsonl`),text.split('\n')[0]+'\n')
    await enable(b.controller); expect(b.store.overview().selected.tokens).toBe(100); expect(b.controller.status().issues.length).toBeGreaterThan(0)
    expect((await readdir(shared)).length).toBeGreaterThan(names.length)
  })
  it('reports equal-version conflicts and retains newer rows under reordered delivery', async () => {
    const a=node('a'), b=node('b'); insertRecord(a.db,record('a')); await enable(a.controller); await enable(b.controller)
    await batchFile('a',lines=>{ if(lines[1].records) lines[1].records[0].inputTokens=999; return lines })
    await b.controller.syncNow(); expect(b.store.overview().selected.tokens).toBe(100)
    expect(b.controller.status().issues.join('')).toContain('冲突')
    const updated=record('a',120); updated.updatedAt+=10000; insertRecord(a.db,updated); await a.controller.syncNow(); await b.controller.syncNow(); expect(b.store.overview().selected.tokens).toBe(120)
  })
  it('detects copied installation binding and same-device independent writers', async () => {
    const a=node('a'); insertRecord(a.db,record('a')); await enable(a.controller); a.controller.stop()
    const cloned=new FolderSyncController({db:a.db,deviceId:'a',binding:'other-host'}); controllers.push(cloned)
    await expect(cloned.configure(shared,true,true)).rejects.toThrow('复制')
    const other=node('a','new-local-db'); await enable(other.controller); expect(other.controller.status().error).toContain('相同设备')
  })
  it('uses periodic reconciliation and exponential offline backoff, with bounded stop', async () => {
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']}); const a=node('a')
    await a.controller.configure(shared,true,true); await a.controller.syncNow()
    expect(a.controller.status().nextRunAt! - Date.now()).toBe(60000)
    await rename(shared,join(root,'offline')); await a.controller.syncNow()
    expect(a.controller.status().nextRunAt! - Date.now()).toBe(120000)
    await a.controller.syncNow(); expect(a.controller.status().nextRunAt! - Date.now()).toBe(240000)
    a.controller.stop(); expect(a.controller.status().nextRunAt).toBeNull()
  })
  it('cancels after collection before any publish', async () => {
    let release!:()=>void; const gate=new Promise<void>(r=>{release=r})
    const a=node('a','a',()=>gate); insertRecord(a.db,record('a')); await a.controller.configure(shared,true,true)
    const run=a.controller.syncNow(); await new Promise(r=>setImmediate(r)); const paused=a.controller.configure(undefined,false,true); release(); await run; await paused
    expect(await readdir(shared)).toEqual([]); expect(a.controller.status().enabled).toBe(false)
  })
  it('publishes corrections without updated_at changes and excludes synced/foreign rows', async () => {
    const a=node('a'), b=node('b'); const initial=record('a'); insertRecord(a.db,initial)
    insertRecord(a.db,{...record('a',900),id:'cloud-row',origin:'synced'})
    insertRecord(a.db,{...record('foreign',700),id:'foreign-local'})
    await enable(a.controller); await enable(b.controller); expect(b.store.overview().selected.tokens).toBe(100)
    a.db.prepare('UPDATE records SET input_tokens=140 WHERE id=?').run(initial.id)
    await a.controller.syncNow(); await b.controller.syncNow(); expect(b.store.overview().selected.tokens).toBe(140)
  })
  it('bounds each receive round to 128 files and eventually retries repaired incomplete files', async () => {
    const a=node('a'), b=node('b'); insertRecord(a.db,record('a')); await enable(a.controller)
    let text=''
    for(const name of await readdir(shared)) { const candidate=await readFile(join(shared,name),'utf8'); if(candidate.trim().split('\n').length===3) text=candidate }
    await Promise.all(Array.from({length:130},()=>writeFile(join(shared,`${deviceKeyFor('a')}.${writer(a.db)}.${randomUUID()}.jsonl`),text)))
    await enable(b.controller)
    const received=()=>Number((b.db.prepare('SELECT count(*) AS n FROM hud_folder_sync_receipts').get() as any).n)
    expect(received()).toBe(128); await b.controller.syncNow(); expect(received()).toBe(132)
    const name=`${deviceKeyFor('a')}.${writer(a.db)}.${randomUUID()}.jsonl`
    await writeFile(join(shared,name),text.split('\n')[0]); await b.controller.syncNow(); expect(b.controller.status().issues.length).toBeGreaterThan(0)
    await writeFile(join(shared,name),text); await b.controller.syncNow(); await b.controller.syncNow(); expect(received()).toBe(133)
  })
  it('blocks two processes sharing a DB lease and fails collection safely', async () => {
    let release!:()=>void; const gate=new Promise<void>(r=>{release=r})
    const a=node('a','a',()=>gate); await a.controller.configure(shared,true,true)
    const other=new FolderSyncController({db:a.db,deviceId:'a',binding:'a'}); controllers.push(other)
    const run=a.controller.syncNow(); await new Promise(r=>setImmediate(r)); await other.syncNow()
    expect(other.status().error).toContain('另一进程'); release(); await run
    a.controller.stop(); other.stop()
    const bad=new FolderSyncController({db:a.db,deviceId:'a',binding:'a',collect:async()=>({errors:['PRIVATE_PARSER_ERROR']})}); controllers.push(bad)
    bad.start(); await bad.syncNow(); expect(bad.status().error).toContain('采集'); expect(bad.status().error).not.toContain('PRIVATE')
  })
  it('does not advance success or expose paths for inaccessible configuration', async () => {
    const a=node('a'); await expect(a.controller.configure(join(root,'not accessible'),true,true)).rejects.toThrow('无权限')
    expect(a.controller.status().enabled).toBe(false); expect(a.controller.status().lastSuccessAt).toBeNull()
    await expect(a.controller.configure(root,true,true)).rejects.toThrow('私人 SQLite')
  })
  it('observes pause from another process before publishing', async () => {
    const a=node('a'); insertRecord(a.db,record('a')); await enable(a.controller)
    const other=new FolderSyncController({db:a.db,deviceId:'a',binding:'a'}); controllers.push(other)
    await other.configure(undefined,false,true); expect(a.controller.status().enabled).toBe(false)
    const count=(await readdir(shared)).length; insertRecord(a.db,record('a',200)); await a.controller.syncNow(); expect((await readdir(shared)).length).toBe(count)
  })
  it('rejects oversized record counts and immutable receipt edits but preserves healthy imports', async () => {
    const a=node('a'),b=node('b'); insertRecord(a.db,record('a')); await enable(a.controller); await enable(b.controller)
    await batchFile('a',lines=>{ lines[1].records=Array.from({length:1001},()=>lines[1].records[0]);lines[2].records=1001;return lines })
    let dataName=''
    for(const name of await readdir(shared)) {const text=await readFile(join(shared,name),'utf8');if(text.length<10000&&text.trim().split('\n').length===3){dataName=name;break}}
    const lines=(await readFile(join(shared,dataName),'utf8')).trim().split('\n').map(s=>JSON.parse(s));lines[1].records[0].inputTokens=999
    await writeFile(join(shared,dataName),lines.map(v=>JSON.stringify(v)).join('\n')+'\n')
    await b.controller.syncNow();expect(b.store.overview().selected.tokens).toBe(100);expect(b.controller.status().issues.length).toBeGreaterThan(0)
  })
  it('fails safely at the directory entry cap', async () => {
    const a=node('a');await a.controller.configure(shared,true,true)
    // Avoid an automatic timer while constructing the synthetic over-limit directory.
    a.controller.stop()
    for(let start=0;start<10001;start+=250)await Promise.all(Array.from({length:Math.min(250,10001-start)},(_,i)=>mkdir(join(shared,`unrelated-${start+i}`))))
    a.controller.start();await a.controller.syncNow();expect(a.controller.status().error).toContain('10000');expect(a.controller.status().lastSuccessAt).toBeNull()
  },20000)
  it('preserves epoch timestamps and aggregates imported devices in the receiving timezone', async () => {
    const a=node('a'),b=node('b'),now=Date.UTC(2026,9,4,0,30)
    insertRecord(a.db,{...record('a',100),ts:now});insertRecord(b.db,{...record('b',200),ts:now-3600000})
    await enable(a.controller);await enable(b.controller);await a.controller.syncNow()
    const payload=(a.db.prepare('SELECT payload FROM hud_usage_metadata').get() as {payload:string}).payload
    expect(JSON.parse(payload).ts).toBe(now-3600000)
    for(const [zone,expected] of [['UTC',100],['Asia/Shanghai',300],['America/Los_Angeles',300]] as const) {
      vi.stubEnv('TZ',zone); expect(a.store.overview('today',undefined,undefined,new Date(now)).selected.tokens).toBe(expected)
    }
  })
})
