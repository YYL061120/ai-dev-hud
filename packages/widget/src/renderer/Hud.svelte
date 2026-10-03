<script lang="ts">
  import { onMount } from 'svelte'
  import type { HudAPI } from '../preload'
  import type { HudData } from '../hud-data'
  import type { HudState } from '../hud-window'
  import type { UsagePeriod } from '../../../core/src/usage-rings.js'
  import UsageRings from '../../../web/src/lib/components/UsageRings.svelte'
  const api = (window as Window & { hud: HudAPI }).hud
  let root: HTMLElement, reduced = false
  let data: HudData = { status: 'unavailable', today: { tokens: 0, sessions: 0, usageRecords: 0, cost: 0 }, week: { tokens: 0, sessions: 0, usageRecords: 0, cost: 0 }, models: [], updatedAt: 0 }
  let state: HudState = { expanded: false, displayId: 0, reveal: 0, hoverEnabled: true }
  let error = '', opening = false, loading = true, period: UsagePeriod = 'today', ringActiveKey: string | null = null
  const periods: Array<{ key: UsagePeriod; label: string }> = [{ key: 'today', label: '今日' }, { key: 'seven', label: '7 天' }, { key: 'thirty', label: '30 天' }, { key: 'lifetime', label: '累计' }]
  const number = (value: number) => value.toLocaleString('zh-CN')
  async function expand(expanded: boolean) { try { state = await api.setExpanded(expanded); if (!expanded) ringActiveKey = null } catch { error = '无法调整 HUD，请重试' } }
  async function refresh() { try { data = await api.refresh(); error = data.status === 'unavailable' ? data.error ?? '数据暂不可用' : '' } catch { error = '读取用量失败，请打开 Dashboard' } loading = false }
  async function openDashboard() { opening = true; try { await api.openDashboard(); error = '' } catch { error = '无法打开 Dashboard，请确认本机 AIUsage 服务' } finally { opening = false } }
  onMount(() => {
    document.title = 'AI Dev HUD'; document.documentElement.lang = 'zh-CN'; document.documentElement.classList.add('hud-mode'); document.body.classList.add('hud-mode')
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let regionKey = ''
    const report = () => {
      reduced = motion.matches
      const regions = Array.from(root.querySelectorAll<HTMLElement>('.rail, .rail .detail, .summary')).filter(element => {
        return !element.classList.contains('summary') || state.expanded
      }).map(element => {
        const b = element.getBoundingClientRect()
        return { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.min(b.width, innerWidth - Math.max(0, b.x)), height: Math.min(b.height, innerHeight - Math.max(0, b.y)) }
      })
      const card = root.querySelector<HTMLElement>('.rail .detail')
      if (card) {
        const b = card.getBoundingClientRect(), top = parseFloat(getComputedStyle(card, '::before').top)
        regions.push({ x: b.right - 1, y: b.top + top - 3, width: 9, height: 16 })
      }
      const key = JSON.stringify([regions, reduced])
      if (key !== regionKey) { regionKey = key; api.setRegions?.(regions, reduced) }
    }
    const timer = setInterval(report, 32)
    motion.addEventListener('change', report)
    report()
    void refresh(); void api.getState().then(value => state = value).catch(() => error = '无法读取窗口状态')
    const stopData = api.onDataUpdate(value => { data = value; loading = false }), stopState = api.onStateUpdate(value => { state = value; if (value.reveal === 0) ringActiveKey = null })
    return () => { clearInterval(timer); motion.removeEventListener('change', report); stopData(); stopState(); document.documentElement.classList.remove('hud-mode'); document.body.classList.remove('hud-mode') }
  })
  $: rings = data.rings?.[period]
  $: ready = data.status === 'ready'
</script>
<svelte:window on:keydown={(event) => { if (event.key === 'Escape') { if (ringActiveKey) ringActiveKey = null; else void expand(false) } }} />
<main bind:this={root} class:expanded={state.expanded} class:reduced style={`--reveal-offset:${(1 - state.reveal) * 56}px`} inert={state.reveal === 0} aria-hidden={state.reveal === 0} aria-label="AI Dev HUD 设备用量">
      <section class="summary" inert={!state.expanded} aria-hidden={!state.expanded} data-testid="hud-summary">
      <header><div><span>AI DEV HUD</span><h1>设备用量</h1></div><span class="source-status">仅本地</span></header>
      <div class="periods" aria-label="用量周期">{#each periods as item}<button aria-pressed={period === item.key} data-testid={'hud-period-' + item.key} on:click={() => { period = item.key; ringActiveKey = null }}>{item.label}</button>{/each}</div>
      <div class="summary-scroll">
      {#if rings}<UsageRings snapshot={rings} density="hud" bind:activeKey={ringActiveKey} visible={state.reveal > 0 && state.expanded} />
        <p class="explanation">设备弧 = 同周期已采集总量占比<br/>总圈表示总量，不是订阅额度。</p>
        <div class="disconnected"><span>其他设备待接入</span><p>笔记本 / MacBook 等设备可手动导入元数据。未接入不等于用量为零。</p></div>
      {:else}<p class="empty">{loading ? '正在读取设备用量…' : data.ringsError ?? '设备用量尚不可用，请更新本机 Dashboard。'}</p>{/if}
      <div class="local-codex"><span>本机 Codex · 今日</span><b data-testid="today-tokens">{ready ? number(data.today.tokens) : '—'}</b></div>
      <small class="note">按保留记录统计；费用为 API 等价估值。没有开启云同步。</small>
      {#if error}<p role="alert" class="error">{error}</p>{/if}
      </div>
      <footer><button class="dashboard" data-testid="open-dashboard" on:click={openDashboard} disabled={opening}>{opening ? '正在打开…' : '打开 Dashboard'}<span>↗</span></button><button class="refresh" on:click={refresh} aria-label="刷新用量">↻</button></footer>
      <small class="updated">更新 {new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small>
    </section>
  <aside class="rail" aria-label="AI 用量圈">
    <div class="identity" title="AI Dev HUD · Codex">&gt;_</div>
    <div class="rail-rings">{#if rings}<UsageRings snapshot={rings} compact density="hud" bind:activeKey={ringActiveKey} bridgeHeld={state.detailBridgeHeld ?? false} visible={state.reveal > 0 && !state.expanded} detailsEnabled={!state.expanded}/>{:else}<span class="rail-empty">{loading ? '…' : '—'}</span>{/if}</div>
    <button class="toggle" data-testid="hud-toggle" on:click={() => expand(!state.expanded)} aria-label={state.expanded ? '收起 HUD' : '展开 HUD'} aria-expanded={state.expanded}>{state.expanded ? '›' : '‹'}</button>
  </aside>
</main>
<style>
  :global(body.hud-mode *) { box-sizing:border-box; }
  :global(html.hud-mode),:global(body.hud-mode),:global(body.hud-mode #app) { margin:0; width:100%; height:100%; background:transparent; overflow:hidden; }
  :global(body.hud-mode) { font-family:'Segoe UI','Microsoft YaHei',sans-serif; color:#f2f2f5; user-select:none; }
  main { width:100%; height:100%; position:relative; pointer-events:none; }
  button { font:inherit; cursor:pointer; border:0; } button:focus-visible { outline:2px solid #5bc9bd; outline-offset:3px; }
  .rail { position:absolute; right:0; top:max(0px, calc((100% - 216px) / 2)); height:min(216px,100%); width:56px; pointer-events:auto; background:#141416f7; border:1px solid #353538; border-right:0; border-radius:22px 0 0 22px; transform:translateX(var(--reveal-offset)); transition:transform 40ms linear; display:flex; flex-direction:column; align-items:center; padding:10px 1px 7px; } .expanded .rail { border-left:1px solid #303034; background:#111113; }
  .identity { width:29px; height:23px; color:#d6d6db; font:600 13px Consolas,monospace; text-align:center; flex:0 0 auto; }
  .rail-rings { flex:1; min-height:0; overflow:visible; scrollbar-width:none; margin:6px 0; width:52px; } .rail-rings::-webkit-scrollbar { display:none; } .rail-empty { display:block; text-align:center; margin-top:26px; color:#81818a; }
  .toggle { width:32px; height:22px; flex:0 0 auto; border-radius:8px; background:#262629; color:#a7a7af; font-size:20px; }
  .summary { position:absolute; left:0; top:0; width:calc(100% - 56px); height:100%; background:#141416f7; border:1px solid #353538; border-radius:24px 0 0 24px; transform:translateX(40px); opacity:0; pointer-events:none; transition:transform 280ms cubic-bezier(.2,.8,.2,1),opacity 160ms; min-width:0; padding:17px 15px 12px; display:flex; flex-direction:column; }
  .expanded .summary { transform:translateX(var(--reveal-offset)); opacity:1; pointer-events:auto; }
  .reduced .summary,.reduced .rail { transition:none; }
  .summary-scroll { flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:#53535c transparent; }
  .summary-scroll::-webkit-scrollbar { width:5px; } .summary-scroll::-webkit-scrollbar-thumb { background:#53535c; border-radius:5px; }
  header,.periods,footer,.updated { flex-shrink:0; }
  header { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; } header div>span { font-size:8px; letter-spacing:1.3px; color:#8a8a94; } h1 { font-size:18px; margin:5px 0 0; font-weight:600; } .source-status { font-size:9px; color:#7ebdb4; }
  .periods { display:flex; gap:3px; background:#222225; padding:3px; border-radius:9px; margin-bottom:12px; } .periods button { flex:1; padding:5px 0; background:transparent; color:#93939d; border-radius:6px; font-size:10px; } .periods button[aria-pressed=true] { background:#36363b; color:#f5f5f7; }
  .explanation { font-size:9px; color:#84848e; line-height:1.7; margin:13px 1px; }
  .disconnected { padding:13px 0; border-top:1px solid #303034; border-bottom:1px solid #303034; } .disconnected span { font-size:11px; color:#b3b3bd; } .disconnected p { font-size:10px; line-height:1.7; color:#73737e; margin:6px 0 0; }
  .local-codex { display:flex; justify-content:space-between; gap:10px; font-size:10px; margin:15px 0 8px; color:#9b9ba5; } .local-codex b { color:#c7c7cf; font-weight:500; font-variant-numeric:tabular-nums; } .note { font-size:9px; color:#6f6f7b; line-height:1.6; }
  footer { margin-top:auto; display:flex; gap:8px; padding-top:14px; } .dashboard { flex:1; display:flex; justify-content:space-between; background:#d6b569; color:#302919; font-size:11px; font-weight:600; padding:10px 12px; border-radius:9px; } .dashboard:hover { background:#e7c883; } .dashboard:disabled { opacity:.5; } .refresh { width:33px; background:#2b2b30; color:#b0b0bd; border-radius:9px; font-size:19px; }
  .updated { margin-top:8px; text-align:right; font-size:8px; color:#686874; } .empty { color:#9999a4; font-size:11px; line-height:1.7; margin:20px 0; } .error { color:#e89968; font-size:10px; line-height:1.6; }
</style>
