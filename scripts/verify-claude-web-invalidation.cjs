// Production page; synthetic typed data. Delayed usage replies expose immediate invalidation.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url')
const {chromium}=require(process.env.AI_DEV_HUD_PLAYWRIGHT_PATH||'playwright'),root=path.resolve(__dirname,'..'),evidence=process.env.AI_DEV_HUD_HOVER_EVIDENCE_DIR||require('node:os').tmpdir()
let browser,server
async function run(){
 const domain=await import(pathToFileURL(path.join(root,'packages/core/dist/index.js')).href),key='a'.repeat(64),now=new Date(),row={deviceKey:key,recordKey:'1',projectKey:null,sessionKey:null,ts:+now,updatedAt:+now,tool:'claude-code',provider:'anthropic',model:'fixture',platform:'win32',inputTokens:1234,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,thinkingTokens:0,cost:0,costSource:'unknown'},snapshot=domain.buildUsageRings([row],key,'thirty',new Map(),undefined,undefined,now),quota={...domain.normalizeClaudeStatusline({rate_limits:{seven_day:{used_percentage:35}}},+now),scope:'session-observed',generation:'fixture-A',validUntil:+now+120000};snapshot.subscriptions=[quota];snapshot.subscriptionGenerations={'claude-code':quota.generation};const overview={...domain.aggregateUsage([row],key,'thirty',undefined,undefined,now),rings:snapshot},directory=path.join(root,'packages/web/build')
 server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),file=path.resolve(directory,u.pathname.startsWith('/_app/')?u.pathname.slice(1):'index.html');if(!file.startsWith(directory+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const checks=[],errors=[]
 for(const action of ['clear','disable','pause']){
  const page=await browser.newPage({viewport:{width:1280,height:1100},locale:'en-US'});page.on('pageerror',e=>errors.push(e.message));let changed=false,completed=false
  await page.route('**/api/**',async route=>{const u=new URL(route.request().url()),p=u.pathname;let body={}
   if(p==='/api/local/usage'){if(changed){await new Promise(r=>setTimeout(r,1000));completed=true}body=changed?{...overview,rings:domain.invalidateSubscriptionSnapshot(snapshot,'claude-code')}:overview}
   else if(p==='/api/local/claude/statusline')body={enabled:true,configured:true,canRestore:action!=='pause',conflict:false,managedConfigured:true}
   else if(p.endsWith('/preview'))body={id:'fixture-preview',action:'disable',expiresAt:Date.now()+120000,originalPresent:true,settingsExisted:true}
   else if(p.endsWith('/clear')||p.endsWith('/pause')||p.endsWith('/confirm')){changed=true;body={enabled:false,canRestore:false,managedConfigured:false}}
   else if(p==='/api/auth/status')body={enabled:false,authenticated:true}
   await route.fulfill({contentType:'application/json',body:JSON.stringify(body)})
  })
  await page.goto(`http://127.0.0.1:${server.address().port}/local-usage`);await page.locator('.arc').waitFor();await page.locator('#claude-integration summary').click();await page.getByTestId('claude-clear').waitFor()
  if(action==='disable'){await page.getByTestId('claude-preview-disable').click();await page.getByTestId('claude-confirm').click()}else await page.getByTestId('claude-'+action).click()
  await page.waitForFunction(()=>document.querySelectorAll('.arc').length===0,{},{timeout:750});assert.equal(completed,false);assert.equal(await page.getByTestId('usage-ring').getAttribute('data-tokens'),'1234');checks.push({action,immediateBeforeDelayedRefresh:true,tokensPreserved:true});await page.close()
 }
 assert.deepEqual(errors,[]);fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'claude-web-invalidation.json'),JSON.stringify({synthetic:true,checks,errors},null,2));console.log(JSON.stringify({checks,errors}))
}run().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server?.close()})
