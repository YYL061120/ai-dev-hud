import { it, expect } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { StatsRecord, UsageMetadataRecord } from '@aiusage/core'
import { createDatabase } from '../src/db/index.js'
import { insertRecord } from '../src/db/records.js'
import { UsageMetadataStore } from '../src/local-control/usage.js'

const record=(deviceInstanceId='a',origin:StatsRecord['origin']='local'):StatsRecord=>({id:'synthetic-replace',ts:1,ingestedAt:1,updatedAt:1,lineOffset:1,tool:'claude-code',model:'claude-sonnet-4',provider:'anthropic',inputTokens:1,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,thinkingTokens:0,cost:0,costSource:'log',sessionId:'synthetic',sourceFile:'synthetic',cwd:'',device:'synthetic',deviceInstanceId,platform:'win32',origin})
const transfer=(row:UsageMetadataRecord)=>({format:'ai-dev-hud-usage',version:1,exportedAt:1,records:[row]})
async function fixture() {
  const root=await mkdtemp(join(tmpdir(),'hud-identity-replace-')),db=createDatabase(join(root,'cache.db')),external=createDatabase(join(root,'cache.db')),store=new UsageMetadataStore(db,'a')
  return {db,external,store,async ready(){expect(await store.prepareLocalIdentityIndex(()=>true,Date.now()+5000)).toBe(true)},async close(){external.close();db.close();await rm(root,{recursive:true,force:true})}}
}
it('production insertRecord REPLACE reconciles old device and local-to-imported identity on two connections without recursive triggers',async()=>{
  const f=await fixture()
  try {
    expect(f.db.pragma('recursive_triggers',{simple:true})).toBe(0);expect(f.external.pragma('recursive_triggers',{simple:true})).toBe(0)
    insertRecord(f.db,record());await f.ready();const a=f.store.localSyncPage(0,1).records[0]
    insertRecord(f.external,record('b'));await f.ready();const b=new UsageMetadataStore(f.external,'b').localSyncPage(0,1).records[0]
    expect(f.store.import(transfer(a),true)).toEqual({added:1,updated:0,duplicates:0,conflicts:0})
    expect(f.store.import(transfer(b),true).duplicates).toBe(1)
    insertRecord(f.external,record('b','synced'));await f.ready()
    expect(f.store.import(transfer(b),true).added).toBe(1)
    expect((f.db.prepare('SELECT count(*) AS n FROM temp.hud_local_identity').get() as {n:number}).n).toBe(0)
    insertRecord(f.db,record('unknown'));await f.ready();expect(f.store.import(transfer(a),true).duplicates).toBe(1)
    // Same identity corrections retain suppression; a replacement may change rowid.
    insertRecord(f.external,{...record('a'),inputTokens:3});await f.ready();expect(f.store.import(transfer(a),true).duplicates).toBe(1)
    expect(f.db.pragma('recursive_triggers',{simple:true})).toBe(0)
  } finally {await f.close()}
})
it('a conflicting INSERT OR IGNORE attempt preserves the actual local identity and never fabricates the attempted device',async()=>{
  const f=await fixture()
  try {
    insertRecord(f.db,record());await f.ready();const a=f.store.localSyncPage(0,1).records[0]
    f.external.exec("INSERT OR IGNORE INTO records SELECT id,ts,ingested_at,synced_at,updated_at,line_offset,tool,model,provider,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,thinking_tokens,cost,cost_source,session_id,source_file,cwd,device,'ignored-device',platform,'synced' FROM records WHERE id='synthetic-replace'")
    await f.ready();expect(f.store.import(transfer(a),true).duplicates).toBe(1)
    expect((f.db.prepare('SELECT count(*) AS n FROM temp.hud_local_identity').get() as {n:number}).n).toBe(1)
  } finally {await f.close()}
})
it('several REPLACEs before replay remove every retired identity and retain only the final database owner',async()=>{
  const f=await fixture()
  try {
    insertRecord(f.db,record());await f.ready();const a=f.store.localSyncPage(0,1).records[0]
    insertRecord(f.external,record('b'));const b=new UsageMetadataStore(f.external,'b').localSyncPage(0,1).records[0]
    insertRecord(f.external,record('c'));const c=new UsageMetadataStore(f.external,'c').localSyncPage(0,1).records[0]
    insertRecord(f.external,record('c','synced'))
    await f.ready()
    for (const row of [a,b,c]) expect(f.store.import(transfer(row),true).added).toBe(1)
    expect((f.db.prepare('SELECT count(*) AS n FROM temp.hud_local_identity').get() as {n:number}).n).toBe(0)
  } finally {await f.close()}
})
it('UPDATE OR REPLACE id collision also removes the implicitly deleted row identity across connections',async()=>{
  const f=await fixture()
  try {
    insertRecord(f.db,{...record(),id:'source'});insertRecord(f.db,{...record('b'),id:'victim'})
    await f.ready();const source=f.store.localSyncPage(0,10).records[0],victim=new UsageMetadataStore(f.external,'b').localSyncPage(0,10).records[0]
    f.external.exec("UPDATE OR REPLACE records SET id='victim' WHERE id='source'")
    await f.ready()
    expect(f.store.import(transfer(source),true).added).toBe(1);expect(f.store.import(transfer(victim),true).added).toBe(1)
    expect(f.store.import(transfer(f.store.localSyncPage(0,10).records[0]),true).duplicates).toBe(1)
    expect((f.db.prepare('SELECT count(*) AS n FROM temp.hud_local_identity').get() as {n:number}).n).toBe(1)
  } finally {await f.close()}
})
