import { it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const fake = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', async (original) => ({ ...await original<typeof import('node:child_process')>(), spawn: fake.spawn }))
import { lockPosixDirectory } from '../src/local-control/posix-directory-guard.js'
const directories: string[] = []
afterEach(async () => { for (const dir of directories.splice(0)) await rm(dir,{recursive:true,force:true});vi.clearAllMocks() })
async function directory() {const dir=await mkdtemp(join(tmpdir(),'hud-posix-protocol-'));directories.push(dir);return dir}
function helper() {
  const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()})
  child.kill.mockImplementation(()=>{queueMicrotask(()=>child.emit('close',1));return true})
  const frames: Buffer[]=[]
  child.stdin.on('data',(b:Buffer)=>frames.push(Buffer.from(b)))
  fake.spawn.mockReturnValue(child)
  return {child,frames}
}
const filename=()=>`${'a'.repeat(64)}.${randomUUID()}.${randomUUID()}.jsonl`
it('uses byte lengths and bounded IPC without putting private directory in process arguments',async()=>{
  const dir=await directory(),{child,frames}=helper(),opening=lockPosixDirectory(dir)
  await vi.waitFor(()=>expect(frames.length).toBe(2));child.stdout.write('READY\n')
  const lease=await opening;expect(fake.spawn.mock.calls[0][1]).toEqual([])
  expect(frames[1].toString()).toBe(dir)
  const publishing=lease.publish(filename(),'合成\nmetadata')
  expect(frames[2].toString()).toMatch(/ 15\n$/);expect(frames[3].length).toBe(15)
  child.stdout.write('PUBLISHED\n');await publishing
  const closing=lease.release();child.emit('close',0);await closing;expect(lease.alive).toBe(false)
  expect(frames.at(-1)?.toString()).toBe('R\n')
})
it('refuses oversized, traversal and overlapping publication and cancels the in-flight request',async()=>{
  const {child,frames}=helper(),opening=lockPosixDirectory(await directory())
  await vi.waitFor(()=>expect(frames.length).toBe(2));child.stdout.write('READY\n');const lease=await opening
  await expect(lease.publish('../escape','synthetic')).rejects.toThrow()
  await expect(lease.publish(filename(),'x'.repeat(4194305))).rejects.toThrow()
  const pending=lease.publish(filename(),'synthetic'),rejected=expect(pending).rejects.toThrow('原生目录发布失败')
  await expect(lease.publish(filename(),'overlap')).rejects.toThrow()
  await lease.release();await rejected;expect(child.kill).toHaveBeenCalled();expect(lease.alive).toBe(false)
})
it('fails closed on helper startup error without exposing an OS path',async()=>{
  const {child,frames}=helper(),opening=lockPosixDirectory(await directory()),rejected=expect(opening).rejects.toThrow('helper 不可用')
  await vi.waitFor(()=>expect(frames.length).toBe(2));child.emit('error',new Error('private/path'))
  await rejected;expect(child.kill).toHaveBeenCalled()
})
