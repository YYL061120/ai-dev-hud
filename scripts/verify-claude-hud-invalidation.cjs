// Real Electron window integration with synthetic usage and an injected controller pointer.
// No physical desktop input is sent. Native click delivery still requires manual verification.
const { _electron } = require(process.env.AI_DEV_HUD_PLAYWRIGHT_PATH || 'playwright')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { createRequire } = require('node:module'), { spawn } = require('node:child_process'), net = require('node:net')
const root = path.resolve(__dirname, '..'), evidence = process.env.AI_DEV_HUD_HOVER_EVIDENCE_DIR || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'hud-native-bounds-'))
fs.mkdirSync(evidence, { recursive: true })
const profile = fs.mkdtempSync(path.join(evidence, 'native-profile-'))
for (const dir of ['AppData/Roaming','AppData/Local','.aiusage','codex/sessions','empty']) fs.mkdirSync(path.join(profile,dir), { recursive:true })
fs.writeFileSync(path.join(profile,'codex/sessions/rollout-fixture.jsonl'), JSON.stringify({ timestamp:new Date().toISOString(),type:'event_msg',payload:{type:'token_count',model:'gpt-4o',info:{last_token_usage:{input_tokens:100,output_tokens:20,cached_input_tokens:0,reasoning_output_tokens:0}}}})+'\n')
const observer = path.join(profile, 'observer.cjs')
fs.writeFileSync(observer, `const e=require('electron');globalThis.simulatedPointer={x:-9999,y:-9999};e.app.whenReady().then(()=>{e.screen.getCursorScreenPoint=()=>globalThis.simulatedPointer});globalThis.shapes=[];const original=e.BrowserWindow.prototype.setShape;e.BrowserWindow.prototype.setShape=function(rects){globalThis.shapes.push(rects);return original.call(this,rects)};require(process.env.HUD_MAIN_ENTRY)`)
fs.mkdirSync(path.join(profile,'Claude config'),{recursive:true});
const env={...process.env,HOME:profile,CLAUDE_CONFIG_DIR:path.join(profile,'Claude config'),USERPROFILE:profile,APPDATA:path.join(profile,'AppData/Roaming'),LOCALAPPDATA:path.join(profile,'AppData/Local'),CODEX_HOME:path.join(profile,'codex'),AIUSAGE_CODEX_PATH:path.join(profile,'codex/sessions'),AIUSAGE_CLAUDE_CODE_PATH:path.join(profile,'empty'),HUD_MAIN_ENTRY:path.join(root,'packages/widget/dist/main.js')}
delete env.ELECTRON_RUN_AS_NODE;delete env.AIUSAGE_DASHBOARD_PASSWORD
const requireWidget=createRequire(path.join(root,'packages/widget/package.json')), pause=ms=>new Promise(r=>setTimeout(r,ms))
let app, cli
async function until(fn) { for(let i=0;i<200;i++){if(await fn())return;await pause(25)}throw new Error('Native condition timed out') }
async function run(){
 const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r))
 cli=spawn(process.execPath,[path.join(root,'packages/cli/dist/index.js'),'serve','--port',String(port)],{cwd:root,env,windowsHide:true,stdio:'ignore'})
 await until(async()=>{try{return(await fetch(`http://127.0.0.1:${port}/api/auth/status`)).ok}catch{return false}})
 app=await _electron.launch({executablePath:requireWidget('electron'),args:[observer,'--hud'],env,cwd:root})
 const page=await app.firstWindow();await app.evaluate(({screen})=>globalThis.simulatedPointer={x:screen.getPrimaryDisplay().workArea.x+screen.getPrimaryDisplay().workArea.width-4,y:50});await page.locator('.rail [data-testid="usage-ring"]').first().waitFor()
 const base='http://127.0.0.1:'+port
 const post=async(route,body)=>{const r=await fetch(base+'/api/local/claude/statusline/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json()}
 const enable=async()=>{const p=await post('preview',{action:'enable'});await post('confirm',{id:p.id,confirm:true})}
 const capture=async progress=>{const child=spawn(process.execPath,[path.join(profile,'.aiusage/claude-statusline-wrapper.cjs')],{env,windowsHide:true,stdio:['pipe','ignore','ignore']});child.stdin.end(JSON.stringify({session_id:'fixture-session-A',cost:{total_api_duration_ms:progress},rate_limits:{seven_day:{used_percentage:35,resets_at:Math.floor(Date.now()/1000)+86400}}}));await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code?reject(Error('capture failed')):resolve())})}
 await enable();let progress=0
 for(const action of ['clear','disable','pause']){
  await capture(++progress);await page.evaluate(()=>window.hud.refresh());await page.locator('.track[data-tool="claude-code"][data-quota-state="available"]').first().waitFor();const tokens=await page.getByTestId('usage-ring').first().getAttribute('data-tokens')
  const began=Date.now()
  if(action==='disable'){const p=await post('preview',{action:'disable'});await post('confirm',{id:p.id,confirm:true})}else await post(action,{confirm:true})
  await page.waitForFunction(()=>![...document.querySelectorAll('.track[data-tool="claude-code"]')].some(e=>e.getAttribute('data-quota-state')==='available'),{},{timeout:2500});assert(Date.now()-began<2500);assert.equal(await page.getByTestId('usage-ring').first().getAttribute('data-tokens'),tokens)
  if(action==='disable')await enable()
 }
 fs.writeFileSync(path.join(evidence,'claude-hud-invalidation.json'),JSON.stringify({synthetic:true,actualElectron:true,clearDisablePauseImmediatelyUnknown:true,tokensPreserved:true,maximumMilliseconds:2500}))
 const displays=await app.evaluate(({screen})=>screen.getAllDisplays().map(d=>({id:d.id,scaleFactor:d.scaleFactor,workArea:d.workArea})))
 const checks=[], errors=[];page.on('pageerror',e=>errors.push(e.message))
 for(const display of displays){
  const settings=await page.evaluate(()=>window.widget.getSettings());await page.evaluate(s=>window.widget.saveSettings(s),{...settings,hudDisplayId:display.id})
  await pause(550)
  await app.evaluate((_,p)=>globalThis.simulatedPointer=p,{x:display.workArea.x+display.workArea.width-4,y:display.workArea.y+50})
  await until(async()=>(await page.evaluate(()=>window.hud.getState())).reveal===1)
  // Main's settled reveal is delivered before the renderer's 40ms interpolation completes.
  await pause(80)
  const before=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return{bounds:w.getBounds(),focused:w.isFocused(),visible:w.isVisible()}})
  const railBefore=await page.locator('.rail').boundingBox()
  const units=page.locator('.rail [data-testid="usage-ring"]'), b=await units.first().boundingBox()
  const point={x:b.x+b.width/2,y:b.y+20}
  await app.evaluate((_,p)=>globalThis.simulatedPointer=p,{x:before.bounds.x+point.x,y:before.bounds.y+point.y});await pause(50);await page.mouse.move(point.x,point.y)
  const detail=page.locator('.rail [data-testid="ring-detail"]');await detail.waitFor();await pause(320)
  const card=await detail.boundingBox()
  // Native controller holds a pointer in the HWND hole even if the renderer receives mouseleave.
  await app.evaluate((_,p)=>globalThis.simulatedPointer=p,{x:before.bounds.x+card.x+card.width+6,y:before.bounds.y+card.y+50})
  await detail.evaluate(e=>e.closest('.ring-group').dispatchEvent(new MouseEvent('mouseleave')))
  await pause(600);assert.equal(await detail.count(),1);assert.equal((await page.evaluate(()=>window.hud.getState())).detailBridgeHeld,true)
  await app.evaluate((_,p)=>globalThis.simulatedPointer=p,{x:before.bounds.x+card.x+50,y:before.bounds.y+card.y+50});await page.mouse.move(card.x+50,card.y+50);await pause(80)
  const shape=await app.evaluate(()=>globalThis.shapes.at(-1));assert(shape.length>=2);assert(shape.every(r=>r.x+r.width<=before.bounds.width-8))
  await page.evaluate(()=>window.hud.setExpanded(true));await pause(320)
  const expanded=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds()), railExpanded=await page.locator('.rail').boundingBox()
  assert.deepEqual(expanded,before.bounds);assert.deepEqual(railExpanded,railBefore)
  await app.evaluate((_,p)=>globalThis.simulatedPointer=p,{x:before.bounds.x+railBefore.x+30,y:before.bounds.y+railBefore.y+30});await page.mouse.move(railBefore.x+30,railBefore.y+30);
  await page.evaluate(()=>window.hud.setExpanded(false));await pause(320);assert.deepEqual(await page.locator('.rail').boundingBox(),railBefore)
  const focused=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused());assert.equal(focused,false)
  checks.push({display,before,expanded,railBefore,railExpanded,shape,nativeShapeAccepted:true,simulatedPointerBridge:true,noFocusSteal:!focused})
  await app.evaluate(()=>globalThis.simulatedPointer={x:-9999,y:-9999});await until(async()=>(await page.evaluate(()=>window.hud.getState())).reveal===0)
 }
 assert.deepEqual(errors,[])
 fs.writeFileSync(path.join(evidence,'hover-native-bounds.json'),JSON.stringify({synthetic:true,actualElectronWindows:true,physicalDesktopInput:false,checks,errors},null,2));console.log(JSON.stringify({checks:checks.length,errors}))
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await app?.close();cli?.kill()})
