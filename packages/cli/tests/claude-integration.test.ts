import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { ClaudeStatuslineManager, installationPath, readClaudeInstallation } from '../src/local-control/claude-integration.js'
import { captureManagedClaude, readManagedClaude } from '../src/local-control/claude-observation.js'
async function fixture(original = false) {
  const root = await mkdtemp(join(tmpdir(), 'HUD Claude spaces ')), config = join(root, 'Claude config'), state = join(root, 'HUD state')
  await mkdir(config)
  const script = join(root, 'original status.cjs')
  await writeFile(script, "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{process.stdout.write('\\x1b[32mORIGINAL '+JSON.parse(s).fixture+'\\n\\x1b[0m');process.stderr.write('ORIGINAL STDERR\\n')})")
  const initial = { unrelated: { token: 'PRIVATE_SETTING_FIXTURE' }, ...(original ? { statusLine: { type: 'command', command: `"${process.execPath.replaceAll('\\','/')}" "${script.replaceAll('\\','/')}"`, padding: 3 } } : {}) }
  await writeFile(join(config, 'settings.json'), JSON.stringify(initial))
  const manager = new ClaudeStatuslineManager(config, state, resolve('dist/index.js'))
  return { root, config, state, manager, initial }
}
const payload = (session = 'fixture-session-A', percent = 35, response = 1) => ({ session_id: session, fixture: 'OUTPUT', prompt: 'PRIVATE_PROMPT_FIXTURE', credentials: 'PRIVATE_CREDENTIAL_FIXTURE', cost: { total_api_duration_ms: response }, rate_limits: { seven_day: { used_percentage: percent, resets_at: Math.floor(Date.now()/1000)+86400 } } })
async function enable(f: Awaited<ReturnType<typeof fixture>>) { const preview = await f.manager.preview('enable'); await f.manager.confirm(preview.id, true); return (await readClaudeInstallation(f.state))!.id }
function execute(wrapper: string, value: unknown): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => { const child = spawn(process.execPath, [wrapper], { windowsHide: true, stdio: ['pipe','pipe','pipe'] }); let stdout = '', stderr = ''; const timer = setTimeout(()=>{child.kill();reject(new Error('Fixture wrapper timeout'))},5000);child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve({stdout,stderr,code})});child.stdin.end(JSON.stringify(value)) })
}
describe('explicit local Claude statusline composition', () => {
  it('preview/cancel/refusal cannot change settings, and outside edits invalidate the confirmation', async () => {
    const f = await fixture(true), before = await readFile(join(f.config,'settings.json'),'utf8')
    const preview = await f.manager.preview('enable')
    expect(await readFile(join(f.config,'settings.json'),'utf8')).toBe(before)
    expect(existsSync(installationPath(f.state))).toBe(false)
    expect(JSON.stringify(preview)).not.toMatch(/PRIVATE|command|token/)
    await expect(f.manager.confirm(preview.id,false)).rejects.toThrow('confirmation')
    const again = await f.manager.preview('enable'); await writeFile(join(f.config,'settings.json'),JSON.stringify({...f.initial,external:true}))
    await expect(f.manager.confirm(again.id,true)).rejects.toThrow('changed after preview')
    expect(JSON.parse(await readFile(join(f.config,'settings.json'),'utf8')).external).toBe(true)
  })
  it.each([true,false])('preserves original stdout/stdin/stderr through spaced paths, captures only metadata and restores (%s)', async original => {
    const f = await fixture(original), id = await enable(f)
    const backup = await readFile(installationPath(f.state),'utf8'); expect(backup).not.toContain('PRIVATE_SETTING_FIXTURE')
    const result = await execute(join(f.state,'claude-statusline-wrapper.cjs'),payload())
    expect(result.code).toBe(0)
    expect(result.stdout).toBe(original ? '\x1b[32mORIGINAL OUTPUT\n\x1b[0m' : 'Claude Code\n')
    expect(result.stderr).toBe(original ? 'ORIGINAL STDERR\n' : '')
    const observation = await readManagedClaude(f.state)
    expect(observation).toMatchObject({scope:'session-observed',windows:[{usedPercent:35}]})
    expect(JSON.stringify(observation)).not.toMatch(/session_id|fixture-session|fingerprint|PRIVATE|key/)
    expect(await readFile(join(f.state,'claude-session-observations.json'),'utf8')).not.toMatch(/PRIVATE|fixture-session|session_id|total_api_duration_ms/)
    const disable = await f.manager.preview('disable'); await f.manager.confirm(disable.id,true)
    expect(JSON.parse(await readFile(join(f.config,'settings.json'),'utf8'))).toEqual(f.initial)
    expect(await readManagedClaude(f.state)).toMatchObject({reason:'disabled',windows:[]})
    await captureManagedClaude(payload(),id,f.state); expect((await readManagedClaude(f.state)).windows).toEqual([])
  })
  it('does not overwrite external configuration edits on disable', async () => {
    const f = await fixture(true); await enable(f)
    const settings = JSON.parse(await readFile(join(f.config,'settings.json'),'utf8'));settings.userEdit=true;await writeFile(join(f.config,'settings.json'),JSON.stringify(settings))
    await expect(f.manager.preview('disable')).rejects.toThrow('changed externally')
    expect(JSON.parse(await readFile(join(f.config,'settings.json'),'utf8')).userEdit).toBe(true)
    await f.manager.pause();expect((await readManagedClaude(f.state)).reason).toBe('disabled')
    expect(JSON.parse(await readFile(join(f.config,'settings.json'),'utf8')).userEdit).toBe(true)
    await expect(f.manager.preview('enable')).rejects.toThrow('wrapper remains configured')
  })
  it('oversized capture input still preserves original rendering, and absent settings are restored to absence', async () => {
    const f=await fixture(true);await enable(f)
    const input={...payload(),fixture:'输出🙂',padding:'x'.repeat(260*1024)}
    const rendered=await execute(join(f.state,'claude-statusline-wrapper.cjs'),input)
    expect(rendered.stdout).toBe('\x1b[32mORIGINAL 输出🙂\n\x1b[0m')
    expect((await readManagedClaude(f.state)).windows).toEqual([])
    const root=await mkdtemp(join(tmpdir(),'HUD absent settings ')),config=join(root,'config'),state=join(root,'state'),manager=new ClaudeStatuslineManager(config,state,resolve('dist/index.js'))
    const preview=await manager.preview('enable');await manager.confirm(preview.id,true);const disable=await manager.preview('disable');await manager.confirm(disable.id,true);expect(existsSync(join(config,'settings.json'))).toBe(false)
  })
  it('parallel sessions are unavailable rather than blended, repeated old payload cannot extend TTL, and clearing blocks late input', async () => {
    const f=await fixture(),id=await enable(f),now=Date.now()
    await Promise.all([captureManagedClaude(payload('fixture-session-A'),id,f.state,now,'100'),captureManagedClaude(payload('fixture-session-B'),id,f.state,now,'101')])
    expect(await readManagedClaude(f.state,now+1)).toMatchObject({reason:'multiple-sessions',windows:[]})
    expect(await readManagedClaude(f.state,now+30001)).toMatchObject({reason:'expired',windows:[]})
    const single=await fixture(),otherId=await enable(single)
    const stable = payload()
    await captureManagedClaude(stable,otherId,single.state,now,'100');const first=await readManagedClaude(single.state,now+1)
    await captureManagedClaude(stable,otherId,single.state,Date.now(),'101');expect((await readManagedClaude(single.state,now+10001)).validUntil).toBe(first.validUntil)
    await single.manager.clear();await captureManagedClaude(payload('fixture-session-A',72,2),otherId,single.state,now-10,'99')
    expect(await readManagedClaude(single.state)).toMatchObject({reason:'cleared',windows:[]})
    await captureManagedClaude(stable,otherId,single.state,Date.now()+1,'103');expect((await readManagedClaude(single.state)).windows).toEqual([])
    await captureManagedClaude(payload('fixture-session-A',42,3),otherId,single.state,Date.now()+2,'104');expect((await readManagedClaude(single.state)).windows[0].usedPercent).toBe(42)
  })
  it('missing session, missing windows and changed managed command have explicit reasons', async () => {
    const f=await fixture(),id=await enable(f),now=Date.now()
    await captureManagedClaude({rate_limits:payload().rate_limits},id,f.state,now,'100');expect((await readManagedClaude(f.state)).reason).toBe('missing-session')
    await captureManagedClaude({session_id:'fixture-session-A'},id,f.state,now+1,'101');expect((await readManagedClaude(f.state)).reason).toBe('missing-windows')
    const current=JSON.parse(await readFile(join(f.config,'settings.json'),'utf8'));current.statusLine.command='external command';await writeFile(join(f.config,'settings.json'),JSON.stringify(current));expect((await readManagedClaude(f.state)).reason).toBe('configuration-conflict')
  })
  it('does not permanently exhaust the session cap when more than sixteen sequential sessions end', async () => {
    const f=await fixture(),id=await enable(f),now=Date.now()
    for(let index=0;index<18;index++)await captureManagedClaude(payload(`fixture-session-${index}`),id,f.state,now-(17-index)*31000,String(index+100))
    expect((await readManagedClaude(f.state,now+1)).windows[0].usedPercent).toBe(35)
    expect(JSON.parse(await readFile(join(f.state,'claude-session-observations.json'),'utf8')).sessions).toHaveLength(1)
  })
})
