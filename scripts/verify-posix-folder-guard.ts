// Run on an authorized Mac/Linux after build:collector. Synthetic temp only.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rename, symlink, readFile, readdir, rm, realpath, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { lockSyncDirectory } from '../packages/cli/src/local-control/directory-guard.js'

if (!['darwin','linux'].includes(process.platform)) throw new Error('此测试必须在实际 Mac/Linux 上执行，不接受模拟平台')
const root = await mkdtemp(join(await realpath(tmpdir()), 'hud-posix-synthetic-'))
const selected=join(root,'parent','selected'), outside=join(root,'outside')
await mkdir(selected,{recursive:true}); await mkdir(outside)
const name = () => `${'a'.repeat(64)}.${randomUUID()}.${randomUUID()}.jsonl`
const executable=fileURLToPath(new URL('../packages/cli/native/bin/hud-directory-guard',import.meta.url))
let checks=0
async function refusal(directory: string, override?: string, request?: string) {
  const info=await lstat(directory,{bigint:true}), bytes=Buffer.from(directory)
  const child=spawn(executable,[],{stdio:['pipe','pipe','pipe']}); child.stderr.resume()
  let output='';child.stdout.on('data',b=>{output+=b.toString()})
  const finished=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)})
  const timer=setTimeout(()=>child.kill(),8000)
  child.stdin.on('error',()=>{})
  child.stdin.end(Buffer.concat([Buffer.from(`${override??`${info.dev} ${info.ino}`} ${bytes.length}\n`),bytes,Buffer.from(request??'')]))
  try {assert.equal(await finished,1);assert.ok(output.includes('REFUSED'));checks++} finally {clearTimeout(timer)}
}
try {
  const lease=await lockSyncDirectory(selected)
  try {
    // POSIX permits this rename. Publication must stay at the original dirfd.
    await rename(join(root,'parent'),join(root,'original'))
    await mkdir(join(root,'parent'));await symlink(outside,selected)
    const filename=name(), text='合成 metadata\n'+ 'x'.repeat(65536)
    await lease.publish(filename,text)
    assert.equal(await readFile(join(root,'original','selected',filename),'utf8'),text);checks++
    assert.deepEqual(await readdir(outside),[]);checks++
    await assert.rejects(lease.publish('../escape.jsonl','synthetic'));checks++
    await assert.rejects(lease.publish(name(),'x'.repeat(4194305)));checks++
    await assert.rejects(lease.publish(filename,'replacement'));checks++
    assert.equal(await readFile(join(root,'original','selected',filename),'utf8'),text);checks++
  } finally {await lease.release();assert.equal(lease.alive,false);checks++}
  await assert.rejects(lockSyncDirectory(selected));checks++
  const original=join(root,'original','selected')
  await refusal(selected)
  await refusal(original+'/../selected')
  await refusal(selected)
  await refusal(original+'/../selected')
  await refusal(original,'0 0')
  await refusal(original,undefined,`P ../outside 0\n`)
  await refusal(original,undefined,`P ${name()} 4194305\n`)
  const blocked=name();await symlink(join(outside,'sentinel'),join(original,`.${blocked}.tmp`))
  await refusal(original,undefined,`P ${blocked} 0\n`)
  assert.deepEqual(await readdir(outside),[]);checks++
  const resume=await lockSyncDirectory(original)
  try {await resume.publish(name(),'synthetic resume');checks++}finally{await resume.release()}
  console.log(JSON.stringify({synthetic:true,platform:process.platform,checks,ancestorSwapExecuted:true,outsideFiles:0,realDriveTested:false}))
} finally {await rm(root,{recursive:true,force:true})}
