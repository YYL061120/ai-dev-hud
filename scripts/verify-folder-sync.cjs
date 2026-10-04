// Three isolated synthetic nodes, production CLI/API and production Svelte UI.
// Does not access user provider logs, real cloud folders or install background jobs.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http')
const { spawn, spawnSync } = require('node:child_process'), assert = require('node:assert/strict')
const { chromium } = require(process.env.AI_DEV_HUD_PLAYWRIGHT_PATH || 'playwright')
const root = path.resolve(__dirname, '..'), cli = path.join(root, 'packages/cli/dist/index.js')
const Database = require(path.join(root,'packages/cli/node_modules/better-sqlite3'))
const evidence = fs.mkdtempSync(path.join(os.tmpdir(),'hud-folder-sync-evidence-'))
const shared = path.join(evidence,'Synthetic Shared Drive'), profiles = [], processes = []
fs.mkdirSync(shared)
const wait = ms => new Promise(r=>setTimeout(r,ms))
async function freePort() { const s=http.createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r)); const p=s.address().port; await new Promise(r=>s.close(r)); return p }
async function request(port,route,body) { const r=await fetch(`http://127.0.0.1:${port}/api/local/${route}`, body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); const v=await r.json(); assert.equal(r.status,200,JSON.stringify(v)); return v }
async function until(work) { const end=Date.now()+15000; let error; while(Date.now()<end) { try {if(await work())return} catch(e){error=e} await wait(50) } throw error||new Error('Timed out') }
function command(env,args,entry=cli) { const r=spawnSync(process.execPath,[entry,...args],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:20000}); assert.equal(r.status,0,r.stderr); return r.stdout }
let browser
async function run() {
  for(const [i,label] of ['windows-desktop','windows-laptop','mac-synthetic'].entries()) {
    const profile=path.join(evidence,label); for(const d of ['.aiusage','AppData/Roaming','AppData/Local','empty'])fs.mkdirSync(path.join(profile,d),{recursive:true})
    fs.writeFileSync(path.join(profile,'.aiusage/config.json'),JSON.stringify({exchangeRate:.14,displayCurrency:'USD',refreshInterval:0,leaderboardAutoUpload:false}))
    const env={...process.env,USERPROFILE:profile,HOME:profile,APPDATA:path.join(profile,'AppData/Roaming'),LOCALAPPDATA:path.join(profile,'AppData/Local'),CODEX_HOME:path.join(profile,'empty'),CLAUDE_CONFIG_DIR:path.join(profile,'empty'),AIUSAGE_CODEX_PATH:path.join(profile,'empty'),AIUSAGE_CLAUDE_CODE_PATH:path.join(profile,'empty')}; delete env.AIUSAGE_DASHBOARD_PASSWORD
    command(env,['folder-sync','--status'])
    const state=JSON.parse(fs.readFileSync(path.join(profile,'.aiusage/state.json'),'utf8')), db=new Database(path.join(profile,'.aiusage/cache.db'))
    db.prepare('INSERT INTO records (id,ts,ingested_at,updated_at,line_offset,tool,model,provider,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,thinking_tokens,cost,cost_source,session_id,source_file,cwd,device,device_instance_id,platform,origin) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('PRIVATE_SYNTHETIC_RECORD',Date.now(),Date.now(),Date.now(),1,'claude-code','claude-sonnet-4','anthropic',(i+1)*100,0,0,0,0,.01,'log','PRIVATE_SESSION','PRIVATE_SOURCE','PRIVATE_PATH','PRIVATE_HOST',state.deviceInstanceId,i===2?'darwin':'win32','local'); db.close()
    if(i===2)command(env,['folder-sync','--directory',shared,'--enable','--once'],path.join(root,'packages/cli/dist-collector/index.js'))
    const port=await freePort(), child=spawn(process.execPath,[cli,'serve','--host','127.0.0.1','--port',String(port)],{cwd:root,env,windowsHide:true,stdio:'ignore'}); processes.push(child)
    await until(async()=> (await fetch(`http://127.0.0.1:${port}/api/auth/status`)).ok)
    profiles.push({profile,env,port})
  }
  browser=await chromium.launch({channel:'msedge',headless:true}); const page=await browser.newPage({viewport:{width:1200,height:1200}}), errors=[]
  page.on('pageerror',e=>errors.push(e.message)); await page.addInitScript(()=>localStorage.setItem('aiusage-lang','zh'))
  await page.goto(`http://127.0.0.1:${profiles[0].port}/local-usage`); await page.getByTestId('folder-sync').waitFor()
  await page.locator('#sync-directory').fill(shared); await page.getByRole('button',{name:'确认目录并启用脱敏同步'}).click()
  try { await until(async()=> (await request(profiles[0].port,'folder-sync')).enabled) } catch(error) { await page.screenshot({path:path.join(evidence,'activation-failed.png'),fullPage:true}); throw new Error(`${error.message}: ${await page.getByTestId('folder-sync').innerText()}`) }
  await request(profiles[1].port,'folder-sync/configure',{directory:shared,enabled:true,confirm:true})
  for(const n of profiles)await request(n.port,'folder-sync/run',{})
  for(const n of profiles)await request(n.port,'folder-sync/run',{})
  const totals=[]
  for(const n of profiles) {const data=await request(n.port,'usage?period=lifetime'); totals.push(data.selected.tokens);assert.equal(data.selected.tokens,600);assert.equal(data.rings.devices.length,3)}
  await page.reload(); await until(async()=> (await page.getByTestId('usage-lifetime').innerText()).includes('600'))
  await wait(600)
  await page.screenshot({path:path.join(evidence,'folder-sync-production.png'),fullPage:true})
  const before=fs.readdirSync(shared).length; await request(profiles[0].port,'folder-sync/run',{}); assert.equal(fs.readdirSync(shared).length,before)
  await page.getByRole('button',{name:'暂停同步'}).click(); await until(async()=> !(await request(profiles[0].port,'folder-sync')).enabled)
  const rejection=await fetch(`http://127.0.0.1:${profiles[0].port}/api/local/folder-sync/configure`,{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.example'},body:JSON.stringify({directory:shared,enabled:true,confirm:true})}); assert.equal(rejection.status,403)
  await page.getByRole('button',{name:'确认目录并启用脱敏同步'}).click(); await until(async()=> (await request(profiles[0].port,'folder-sync')).enabled)
  const privateText=fs.readdirSync(shared).filter(n=>n.endsWith('.jsonl')).map(n=>fs.readFileSync(path.join(shared,n),'utf8')).join(''); assert(!/PRIVATE_|email|prompt|response|sourceFile|directory|snapshot|quota|credential/.test(privateText))
  assert.deepEqual(errors,[])
  const result={synthetic:true,realMacTested:false,realGoogleDriveAccessed:false,totals,deviceCount:3,duplicatesStable:true,uiEnabledAndPaused:true,originRejected:true,privacyAllowlist:true,errors}
  fs.writeFileSync(path.join(evidence,'folder-sync-production.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify({evidence,...result}))
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();for(const child of processes)child.kill()})
