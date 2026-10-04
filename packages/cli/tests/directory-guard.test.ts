import { it, expect } from 'vitest'
import { mkdtemp, mkdir, rename, readdir, readFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { lockSyncDirectory } from '../src/local-control/directory-guard.js'
import { createDatabase } from '../src/db/index.js'
import { FolderSyncController } from '../src/local-control/folder-sync.js'

it('pins native publication, refuses directory substitution, and leaves no outside temp', async () => {
  const root=await mkdtemp(join(tmpdir(),'hud-native-race-')),selected=join(root,'selected'),outside=join(root,'outside')
  await mkdir(selected);await mkdir(outside)
  const lease=await lockSyncDirectory(selected)
  try {
    if (process.platform === 'win32') await expect(rename(selected,join(root,'original'))).rejects.toThrow()
    const filename=`${'a'.repeat(64)}.${randomUUID()}.${randomUUID()}.jsonl`
    await lease.publish(filename,'synthetic metadata\n')
    expect(await readFile(join(selected,filename),'utf8')).toBe('synthetic metadata\n')
    expect(await readdir(outside)).toEqual([])
    expect((await readdir(selected)).filter(n=>n.endsWith('.tmp'))).toEqual([])
    await expect(lease.publish(filename,'replacement')).rejects.toThrow()
    expect(await readFile(join(selected,filename),'utf8')).toBe('synthetic metadata\n')
    expect((await readdir(selected)).filter(n=>n.endsWith('.tmp'))).toEqual([])
  } finally {await lease.release();await rm(root,{recursive:true,force:true})}
},20000)
it('rejects impersonating a foreign platform before any automatic publication',async()=>{
  const foreign = process.platform === 'win32' ? 'darwin' : 'win32'
  await expect(lockSyncDirectory('unused',foreign)).rejects.toThrow('模拟平台')
})
it('ancestor swap at publication cannot redirect a handle-relative temp or rename',async()=>{
  const root=await mkdtemp(join(tmpdir(),'hud-native-ancestor-')),parent=join(root,'parent'),selected=join(parent,'selected'),outside=join(root,'outside')
  await mkdir(selected,{recursive:true});await mkdir(outside)
  const lease=await lockSyncDirectory(selected);let moved=false
  try {
    try {await rename(parent,parent+'.original');moved=true} catch {}
    if(moved) {await mkdir(parent);await symlink(outside,selected,'junction')}
    const filename=`${'a'.repeat(64)}.${randomUUID()}.${randomUUID()}.jsonl`
    await lease.publish(filename,'synthetic metadata\n')
    expect(await readdir(outside)).toEqual([])
    expect(await readFile(join(moved?parent+'.original':parent,'selected',filename),'utf8')).toBe('synthetic metadata\n')
    console.log(JSON.stringify({synthetic:true,ancestorSwapExecuted:moved,outsideTempFiles:0}))
  }finally{await lease.release();await rm(root,{recursive:true,force:true})}
},20000)
it('protects real private SQLite behind a junction plus private state and ancestors',async()=>{
  const root=await mkdtemp(join(tmpdir(),'hud-private-boundary-')),cloud=join(root,'cloud'),physical=join(cloud,'private'),alias=join(root,'alias'),state=join(root,'state')
  await mkdir(physical,{recursive:true});await mkdir(state);await symlink(physical,alias,'junction')
  const db=createDatabase(join(alias,'cache.db')),controller=new FolderSyncController({db,deviceId:'a',binding:'a',privateStateDirectory:state})
  try {
    await expect(controller.configure(cloud,true,true)).rejects.toThrow('私人 SQLite')
    await expect(controller.configure(root,true,true)).rejects.toThrow('私人 SQLite')
    await mkdir(join(state,'child'));await expect(controller.configure(join(state,'child'),true,true)).rejects.toThrow('私人 SQLite')
    expect(controller.status().enabled).toBe(false)
    expect(await readdir(cloud)).toEqual(['private'])
  } finally {controller.stop();await controller.drain();db.close();await rm(root,{recursive:true,force:true})}
})
