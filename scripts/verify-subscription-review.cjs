// Pin source to a Git commit; synthetic observations only, no login or private files.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict')
const {pathToFileURL}=require('node:url'),root=path.resolve(__dirname,'..'),ts=require('../packages/core/node_modules/typescript')
const commit=process.argv[2]
if(!commit||!/^[a-f0-9]{40}$/.test(commit))throw Error('Expected a complete commit SHA')
const work=fs.mkdtempSync(path.join(os.tmpdir(),'hud-subscription-review-'))
const source=file=>cp.execFileSync('git',['-c','safe.directory=C:/AI-Tools/ai-dev-hud','show',`${commit}:${file}`],{cwd:root,encoding:'utf8'})
const emit=(name,text)=>fs.writeFileSync(path.join(work,name),ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText)
emit('types.js',source('packages/core/src/types.ts'))
emit('usage-metadata.js',source('packages/core/src/usage-metadata.ts'))
emit('subscription-usage.js',source('packages/core/src/subscription-usage.ts'))
const sqlite=`from '${pathToFileURL(require.resolve('../packages/cli/node_modules/better-sqlite3')).href}'`,subscriptionSource=source('packages/cli/src/local-control/subscriptions.ts'),managed=subscriptionSource.includes('readManagedClaude')
const adapt=text=>text.replace("from '@aiusage/core'","from './subscription-usage.js'").replace("from 'better-sqlite3'",sqlite).replace(/import \{ AIUSAGE_DIR \} from '..\/config.js'/,"const AIUSAGE_DIR = ''")
emit('subscriptions.js',adapt(subscriptionSource).replace(/import \{ codexStatus \} from '.\/launcher.js'/,"const codexStatus = async () => { throw Error('Forbidden in fixture') }"))
if(managed){emit('file-mutex.js',adapt(source('packages/cli/src/local-control/file-mutex.ts')));emit('claude-integration.js',adapt(source('packages/cli/src/local-control/claude-integration.ts')).replace(/import \{ LocalControlError \} from '.\/projects.js'/,"class LocalControlError extends Error { constructor(message, status = 400) { super(message); this.status = status } }"));emit('claude-observation.js',adapt(source('packages/cli/src/local-control/claude-observation.ts')))}
fs.writeFileSync(path.join(work,'package.json'),'{"type":"module"}')
fs.writeFileSync(path.join(work,'worker.mjs'),`import fsp from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';
const [directory,percent,delayed]=process.argv.slice(2);
if(delayed==='hold'){const original=fsp.writeFile;fsp.writeFile=async(...args)=>{if(String(args[0]).endsWith('.tmp')){process.send('locked');await new Promise(resolve=>process.once('message',resolve))}return original(...args)};syncBuiltinESMExports()}
if(delayed==='equal')Date.now=()=>1800000000000;
const {captureClaudeSubscription}=await import('./subscriptions.js');
async function* input(){if(delayed){process.send('ready');await new Promise(resolve=>process.once('message',resolve))}yield JSON.stringify(percent==='empty'?{}:{rate_limits:{seven_day:{used_percentage:Number(percent)}}})}
await captureClaudeSubscription(input(),directory);process.send('done');process.disconnect();`)
const worker=(dir,percent,delayed)=>cp.fork(path.join(work,'worker.mjs'),[dir,String(percent),...(delayed?[typeof delayed==='string'?delayed:'yes']:[])],{stdio:['ignore','ignore','inherit','ipc'],windowsHide:true})
const message=(child,wanted)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Worker timeout'))},6000);child.on('message',value=>{if(value===wanted){clearTimeout(timer);resolve()}});child.on('error',reject)})
async function run(){
 const domain=await import(pathToFileURL(path.join(work,'subscription-usage.js')).href),now=Date.now(),checks=[]
 const value=domain.normalizeCodexRateLimits({rateLimits:{primary:{usedPercent:72}}},now)
 assert.equal(domain.subscriptionWindowState(value,value.windows[0],now),'unknown');value.generation='A'
 assert.equal(domain.subscriptionWindowState(value,value.windows[0],now,'A'),'available')
 for(const current of ['B',null,undefined])assert.equal(domain.subscriptionWindowState(value,value.windows[0],now,current),'unknown')
 checks.push('missing proof, A to B, logout and late A fail closed')
 for(const ids of [['bucket one','bucket two'],['unknown','bucket two']]){const s=domain.normalizeCodexRateLimits({rateLimitsByLimitId:Object.fromEntries(ids.map(id=>[id,{primary:{usedPercent:11},secondary:{usedPercent:72}}]))},now);assert.deepEqual(s.windows,[]);assert.equal(domain.subscriptionRingWindow(s),undefined)}
 checks.push('invalid identities cannot collapse buckets or select a percentage')
 const mapped=domain.normalizeCodexRateLimits({rateLimits:{limitId:'unused legacy'},rateLimitsByLimitId:{codex:{primary:{usedPercent:35}}}},now);assert.equal(mapped.windows[0]?.usedPercent,35)
 checks.push('authoritative map ignores unused invalid legacy identity')
 const subscriptions=await import(pathToFileURL(path.join(work,'subscriptions.js')).href),originalSpawn=cp.spawn,{syncBuiltinESMExports}=require('node:module'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream')
 let priorGeneration
 try {
  for(const read of [subscriptions.readCodexProxy,subscriptions.readCodexStdio])for(const scenario of ['verified','verified-again','changed','logout','email-null','event','abnormal','premature','error']){
   const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),kill:()=>{}});cp.spawn=()=>child;syncBuiltinESMExports()
   const messages=[],pending=read('fixture.exe'),reply=(id,result)=>messages.push({id,result}),account=email=>({account:{type:'chatgpt',email,planType:'pro'}})
   reply(1,{});reply(2,account('PRIVATE-A'));reply(3,{rateLimits:{primary:{usedPercent:35}}})
   if(scenario==='error')messages.push({id:4,error:{message:'PRIVATE'}})
   else if(scenario!=='premature')reply(4,scenario==='logout'?{account:null}:account(scenario==='changed'?'PRIVATE-B':scenario==='email-null'?null:'PRIVATE-A'))
   if(scenario==='event')messages.push({method:'account/updated'})
   child.stdout.write(messages.map(message=>JSON.stringify(message)).join('\n')+'\n')
   let published=false;void pending.then(()=>published=true);await Promise.resolve();assert.equal(published,false,'Neither transport may publish before normal close')
   child.emit('close',scenario==='abnormal'?1:0)
   const result=await pending
   if(scenario.startsWith('verified')){assert.equal(result.windows[0].usedPercent,35);assert(result.validUntil>Date.now()&&result.validUntil<=Date.now()+30000);assert(!/PRIVATE|email|planType/.test(JSON.stringify(result)));if(priorGeneration)assert.notEqual(priorGeneration,result.generation);priorGeneration=result.generation}else assert.equal(result,undefined)
  }
 } finally {cp.spawn=originalSpawn;syncBuiltinESMExports()}
 checks.push('pinned RPC verifies before/after, projects identity, uses fresh generations, rejects switch/logout/events/errors/abnormal close')
 for(const newest of [72,'empty']){const dir=fs.mkdtempSync(path.join(work,'capture-')),older=worker(dir,11,true);await message(older,'ready');await new Promise(resolve=>setTimeout(resolve,20));const newer=worker(dir,newest,false);await message(newer,'done');const before=JSON.parse(fs.readFileSync(path.join(dir,'subscription-claude.json')));older.send('release');await message(older,'done');const after=JSON.parse(fs.readFileSync(path.join(dir,'subscription-claude.json')));assert.deepEqual(after,before);assert.deepEqual(after.windows.map(w=>w.usedPercent),newest==='empty'?[]:[72])}
 checks.push('two real processes preserve newer 72% and newer empty snapshots')
 for(const newest of [72,'empty']){const dir=fs.mkdtempSync(path.join(work,'equal-'));for(const percent of newest===72?['empty',72]:[72,'empty']){const child=worker(dir,percent,'equal');await message(child,'ready');child.send('release');await message(child,'done')}assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'subscription-claude.json'))).windows,[])}
 checks.push('same millisecond invalidation wins in both orders')
 const dir=fs.mkdtempSync(path.join(work,'crash-')),holder=worker(dir,11,'hold');await message(holder,'ready');holder.send('release');await message(holder,'locked')
 const contender=worker(dir,72,false);let completed=false;contender.on('message',value=>{if(value==='done')completed=true});await new Promise(resolve=>setTimeout(resolve,250));assert.equal(completed,false,'An active lock must not be stolen');const exited=new Promise(resolve=>holder.once('exit',resolve));holder.kill();await exited;await message(contender,'done');assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'subscription-claude.json'))).windows[0].usedPercent,72)
 checks.push('live OS lock not stolen; killed owner releases lock and capture recovers')
 if(managed){
  const {ClaudeStatuslineManager,readClaudeInstallation}=await import(pathToFileURL(path.join(work,'claude-integration.js')).href),{captureManagedClaude,readManagedClaude}=await import(pathToFileURL(path.join(work,'claude-observation.js')).href),dir=fs.mkdtempSync(path.join(work,'Claude spaces ')),config=path.join(dir,'config spaces'),state=path.join(dir,'state spaces');fs.mkdirSync(config)
  const initial={statusLine:{type:'command',command:'node fixture-original.cjs'},untouched:'PRIVATE_SETTINGS_FIXTURE'},settings=path.join(config,'settings.json');fs.writeFileSync(settings,JSON.stringify(initial));const manager=new ClaudeStatuslineManager(config,state,path.join(work,'fixture-cli.mjs'))
  const preview=await manager.preview('enable');assert.deepEqual(JSON.parse(fs.readFileSync(settings)),initial);await assert.rejects(manager.confirm(preview.id,false));assert.deepEqual(JSON.parse(fs.readFileSync(settings)),initial);await manager.confirm(preview.id,true);const id=(await readClaudeInstallation(state)).id
  const payload={session_id:'fixture-session-A',cost:{total_api_duration_ms:1},rate_limits:{seven_day:{used_percentage:35}},prompt:'PRIVATE_PROMPT_FIXTURE'},at=Date.now();await captureManagedClaude(payload,id,state,at,'100');const first=await readManagedClaude(state,at+1);assert.equal(first.scope,'session-observed');assert.equal(first.windows[0].usedPercent,35);assert(!/PRIVATE|session_id|key|fingerprint/.test(JSON.stringify(first)))
  await captureManagedClaude(payload,id,state,Date.now(),'101');assert.equal((await readManagedClaude(state,at+10001)).validUntil,first.validUntil);assert.equal((await readManagedClaude(state,at+30001)).reason,'expired')
  await manager.clear();await captureManagedClaude({...payload,cost:{total_api_duration_ms:2}},id,state,at-1,'102');assert.equal((await readManagedClaude(state)).reason,'cleared')
  await captureManagedClaude(payload,id,state,Date.now()+1,'103');assert.equal((await readManagedClaude(state)).windows.length,0)
  await captureManagedClaude({...payload,cost:{total_api_duration_ms:3}},id,state,Date.now()+2,'104');assert.equal((await readManagedClaude(state)).windows[0].usedPercent,35)
  await captureManagedClaude({...payload,session_id:'fixture-session-B',cost:{total_api_duration_ms:4}},id,state,Date.now()+3,'105');assert.equal((await readManagedClaude(state)).reason,'multiple-sessions')
  const disable=await manager.preview('disable');await manager.confirm(disable.id,true);assert.deepEqual(JSON.parse(fs.readFileSync(settings)),initial);assert.equal((await readManagedClaude(state)).reason,'disabled')
  const again=await manager.preview('enable');await manager.confirm(again.id,true);const edited={...JSON.parse(fs.readFileSync(settings)),external:true};fs.writeFileSync(settings,JSON.stringify(edited));await assert.rejects(manager.preview('disable'));assert.deepEqual(JSON.parse(fs.readFileSync(settings)),edited)
  checks.push('pinned Claude preview/refusal, session projection, unchanged response TTL, clear/late input, parallel sessions, restoration and external conflict')
 }
 const result={commit,checks,passed:true,synthetic:true,work};console.log(JSON.stringify(result,null,2));if(process.env.AI_DEV_HUD_REVIEW_EVIDENCE)fs.writeFileSync(process.env.AI_DEV_HUD_REVIEW_EVIDENCE,JSON.stringify(result,null,2))
}
run().catch(error=>{console.error(error);process.exitCode=1})
