import { it, expect, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { rm, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createDatabase } from '../src/db/index.js'
import { UsageMetadataStore } from '../src/local-control/usage.js'
import type Database from 'better-sqlite3'
import { FolderSyncController } from '../src/local-control/folder-sync.js'
function seed(db:Database.Database,count:number,start=0) {
  db.prepare(`WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<?)
    INSERT INTO records(id,ts,ingested_at,updated_at,line_offset,tool,model,provider,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,thinking_tokens,cost,cost_source,session_id,source_file,cwd,device,device_instance_id,platform,origin)
    SELECT 'row-'||(n+?),1,1,1,1,'claude-code','claude-sonnet-4','anthropic',1,0,0,0,0,0,'log','synthetic','synthetic','synthetic','synthetic','local','win32','local' FROM seq`).run(count,start)
}
it('5000 local rows and three foreign batches build once; receipts and checkpoints never invalidate identities',async()=>{
  const root=mkdtempSync(join(tmpdir(),'hud-identity-revision-')),db=createDatabase(join(root,'cache.db'))
  try {
    seed(db,5000);const store=new UsageMetadataStore(db,'local'),spy=vi.spyOn(db,'prepare')
    const scans=()=>spy.mock.calls.filter(([sql])=>String(sql).includes('SELECT rowid AS cursor, id, device_instance_id FROM records')).length
    expect(await store.prepareLocalIdentityIndex(()=>true,Date.now()+5000)).toBe(true);const initial=scans();expect(initial).toBe(6)
    const sample=store.localSyncPage(0,1).records[0]
    for(let i=0;i<3;i++) {
      db.exec('CREATE TABLE IF NOT EXISTS checkpoint(value INTEGER); INSERT INTO checkpoint VALUES(1)')
      const row={...sample,deviceKey:'b'.repeat(64),recordKey:String(i).repeat(64)}
      expect(store.import({format:'ai-dev-hud-usage',version:1,exportedAt:Date.now(),records:[row]}).added).toBe(1)
    }
    expect(scans()).toBe(initial)
    const external=createDatabase(join(root,'cache.db'));seed(external,1,5000);external.close()
    expect(()=>store.import({format:'ai-dev-hud-usage',version:1,exportedAt:Date.now(),records:[{...sample,deviceKey:'b'.repeat(64),recordKey:'f'.repeat(64)}]},true)).toThrow('本轮不重建')
    expect(scans()).toBe(initial)
    expect(await store.prepareLocalIdentityIndex(()=>true,Date.now()+5000)).toBe(true);expect(scans()).toBe(initial+6)
    spy.mockRestore()
  } finally {db.close();await rm(root,{recursive:true,force:true})}
})
it('one million local rows: cancellation yields after a bounded page and resumes without restart',async()=>{
  const root=mkdtempSync(join(tmpdir(),'hud-identity-million-')),db=createDatabase(join(root,'private','cache.db'))
  try {
    seed(db,1_000_000);const store=new UsageMetadataStore(db,'local');let alive=true
    const begin=performance.now();setImmediate(()=>{alive=false})
    expect(await store.prepareLocalIdentityIndex(()=>alive,Date.now()+30000)).toBe(false)
    const elapsed=performance.now()-begin;expect(elapsed).toBeLessThan(1000)
    const prior=(db.prepare('SELECT count(*) AS n FROM temp.hud_local_identity').get() as {n:number}).n
    expect(prior).toBeGreaterThan(0);expect(prior).toBeLessThanOrEqual(2000)
    expect(await store.prepareLocalIdentityIndex(()=>true,Date.now()+30000,2)).toBe(false)
    expect((db.prepare('SELECT count(*) AS n FROM temp.hud_local_identity').get() as {n:number}).n).toBe(prior+2000)
    const count=(db.prepare('SELECT count(*) AS n FROM temp.hud_local_identity').get() as {n:number}).n
    expect(await store.prepareLocalIdentityIndex(()=>true,Date.now()-1)).toBe(false)
    expect((db.prepare('SELECT count(*) AS n FROM temp.hud_local_identity').get() as {n:number}).n).toBe(count)
    const selected=join(root,'selected');await mkdir(selected)
    const controller=new FolderSyncController({db,deviceId:'local',binding:'synthetic',privateStateDirectory:join(root,'private')})
    await controller.configure(selected,true,true)
    const prepare=db.prepare.bind(db);let armed=true
    const spy=vi.spyOn(db,'prepare').mockImplementation((sql:string)=>{
      if(armed&&sql.includes('SELECT rowid AS cursor, id, device_instance_id')) {armed=false;setImmediate(()=>controller.stop())}
      return prepare(sql)
    })
    const stopBegin=performance.now();await controller.syncNow();await controller.drain();const stopMs=performance.now()-stopBegin
    spy.mockRestore();controller.stop();expect(armed).toBe(false);expect(stopMs).toBeLessThan(1000);expect(await readdir(selected)).toEqual([])
    console.log(JSON.stringify({synthetic:true,localRows:1_000_000,cancelMs:Math.round(elapsed),controllerStopMs:Math.round(stopMs),pageRows:prior,resumeRows:count}))
  } finally {db.close();await rm(root,{recursive:true,force:true})}
},30000)
