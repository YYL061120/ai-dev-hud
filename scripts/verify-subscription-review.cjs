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
emit('subscriptions.js',source('packages/cli/src/local-control/subscriptions.ts').replace("from '@aiusage/core'","from './subscription-usage.js'").replace(/import \{ AIUSAGE_DIR \} from '..\/config.js'/,"const AIUSAGE_DIR = ''").replace(/import \{ codexStatus \} from '.\/launcher.js'/,"const codexStatus = async () => { throw Error('Forbidden in fixture') }"))
fs.writeFileSync(path.join(work,'package.json'),'{"type":"module"}')
fs.writeFileSync(path.join(work,'worker.mjs'),`import { captureClaudeSubscription } from './subscriptions.js';
const [directory,percent,delayed]=process.argv.slice(2);
async function* input(){if(delayed){process.send('ready');await new Promise(resolve=>process.once('message',resolve))}yield JSON.stringify(percent==='empty'?{}:{rate_limits:{seven_day:{used_percentage:Number(percent)}}})}
await captureClaudeSubscription(input(),directory);process.send('done');process.disconnect();`)
const worker=(dir,percent,delayed)=>cp.fork(path.join(work,'worker.mjs'),[dir,String(percent),...(delayed?['yes']:[])],{stdio:['ignore','ignore','inherit','ipc'],windowsHide:true})
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
 for(const newest of [72,'empty']){const dir=fs.mkdtempSync(path.join(work,'capture-')),older=worker(dir,11,true);await message(older,'ready');await new Promise(resolve=>setTimeout(resolve,20));const newer=worker(dir,newest,false);await message(newer,'done');const before=JSON.parse(fs.readFileSync(path.join(dir,'subscription-claude.json')));older.send('release');await message(older,'done');const after=JSON.parse(fs.readFileSync(path.join(dir,'subscription-claude.json')));assert.deepEqual(after,before);assert.deepEqual(after.windows.map(w=>w.usedPercent),newest==='empty'?[]:[72])}
 checks.push('two real processes preserve newer 72% and newer empty snapshots')
 const result={commit,checks,passed:true,synthetic:true,work};console.log(JSON.stringify(result,null,2));if(process.env.AI_DEV_HUD_REVIEW_EVIDENCE)fs.writeFileSync(process.env.AI_DEV_HUD_REVIEW_EVIDENCE,JSON.stringify(result,null,2))
}
run().catch(error=>{console.error(error);process.exitCode=1})
