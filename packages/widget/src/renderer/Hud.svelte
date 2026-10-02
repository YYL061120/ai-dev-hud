<script lang="ts">
  import { onMount } from 'svelte'
  import type { HudAPI } from '../preload'
  import type { HudData } from '../hud-data'
  import type { HudState } from '../hud-window'

  const api = (window as Window & { hud: HudAPI }).hud
  let data: HudData = {
    status: 'unavailable', today: { tokens: 0, sessions: 0, usageRecords: 0, cost: 0 },
    week: { tokens: 0, sessions: 0, usageRecords: 0, cost: 0 }, models: [], updatedAt: 0,
  }
  let state: HudState = { expanded: false, displayId: 0 }
  let error = ''
  let opening = false
  let loading = true
  const number = (value: number) => value.toLocaleString('zh-CN')
  const compact = (value: number) => value >= 1e9 ? `${(value / 1e9).toFixed(1)}B`
    : value >= 1e6 ? `${(value / 1e6).toFixed(1)}M`
    : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : String(value)

  async function expand(expanded: boolean) {
    try { state = await api.setExpanded(expanded) } catch { error = '窗口暂时无法调整，请重试。' }
  }
  async function refresh() {
    try { data = await api.getData(); error = '' } catch { error = '无法读取本地用量，请重试。' }
    loading = false
  }
  async function openDashboard() {
    opening = true
    try { await api.openDashboard(); error = '' }
    catch { error = '无法打开仪表盘，请先启动本地 AIUsage 服务。' }
    finally { opening = false }
  }
  onMount(() => {
    document.title = 'AI Dev HUD'
    document.documentElement.lang = 'zh-CN'
    document.documentElement.classList.add('hud-mode')
    document.body.classList.add('hud-mode')
    void refresh()
    void api.getState().then(value => { state = value }).catch(() => { error = '无法读取窗口状态。' })
    const stopData = api.onDataUpdate(value => { data = value; loading = false })
    const stopState = api.onStateUpdate(value => { state = value })
    return () => {
      stopData(); stopState()
      document.documentElement.classList.remove('hud-mode')
      document.body.classList.remove('hud-mode')
    }
  })
  $: ready = data?.status === 'ready'
</script>

<svelte:window on:keydown={(event) => { if (event.key === 'Escape') void expand(false) }} />

<main class:expanded={state.expanded} aria-label="AI Dev HUD · Codex 本机用量">
  {#if state.expanded}
    <section class="summary" data-testid="hud-summary">
      <header><div><span class="eyebrow">AI DEV HUD</span><h1>Codex 用量</h1></div><span class="local"><i></i>本机</span></header>
      <div class="today"><span>今日 tokens</span><strong data-testid="today-tokens">{ready ? number(data.today.tokens) : '—'}</strong><small>输入、输出、缓存与推理 · 本地日历日</small></div>
      <div class="stats"><div><span>近 7 天</span><b data-testid="week-tokens">{ready ? compact(data.week.tokens) : '—'}</b></div><div><span>今日会话</span><b>{ready ? number(data.today.sessions) : '—'}</b></div><div><span>用量记录</span><b>{ready ? number(data.today.usageRecords) : '—'}</b></div></div>
      <div class="models"><h2>今日模型</h2>{#if ready && data.models.length > 0}<div class="model-list">{#each data.models as model}<div class="model"><div><span title={model.name}>{model.name}</span><small>{compact(model.tokens)} · {model.share}%</small></div><div class="track"><i style:width={`${model.share}%`}></i></div></div>{/each}</div>{:else}<p>{ready ? '今日暂无 Codex 用量记录' : (data?.error ?? '正在读取本机用量…')}</p>{/if}</div>
      <div class="cost"><span>今日 API 等价估算</span><b>{ready ? (data.today.tokens > 0 && data.today.cost === 0 ? '暂无估价' : `$${data.today.cost.toFixed(2)}`) : '—'}</b></div>
      <small class="note">依据 AIUsage 价格数据，非订阅账单；用量记录不等同请求数。</small>
      {#if error}<p role="alert" class="error">{error}</p>{/if}
      <footer><button class="dashboard" data-testid="open-dashboard" on:click={openDashboard} disabled={opening}>{opening ? '正在打开…' : '打开仪表盘'}<span>↗</span></button><button class="refresh" on:click={refresh} aria-label="刷新用量" title="刷新用量">↻</button></footer>
      <small class="updated">{data ? `更新于 ${new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '读取中'}</small>
    </section>
  {/if}
  <aside class="rail" aria-label="Codex 状态">
    <div class="identity" title="OpenAI Codex"><span>&gt;_</span></div><span class="codex">CODEX</span>
    <div class="rail-usage"><span>今日</span><strong data-testid="compact-tokens" title={ready ? `${number(data.today.tokens)} tokens` : (data?.error ?? '正在读取')}>{ready ? compact(data.today.tokens) : (loading ? '…' : '—')}</strong><small>TOKENS</small></div>
    <div class="status" class:waiting={!ready} title={ready ? '本机用量已就绪' : (data?.error ?? '读取中')}><i></i>{ready ? '本机' : '等待'}</div>
    <button class="toggle" data-testid="hud-toggle" on:click={() => expand(!state.expanded)} aria-label={state.expanded ? '折叠 HUD' : '展开 HUD'} aria-expanded={state.expanded} title={state.expanded ? '折叠 · Esc' : '展开用量'}>{state.expanded ? '›' : '‹'}</button>
  </aside>
</main>

<style>
  :global(body.hud-mode *) { box-sizing: border-box; }
  :global(html.hud-mode), :global(body.hud-mode), :global(body.hud-mode #app) { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
  :global(body.hud-mode) { font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; color: #e5ecee; user-select: none; }
  main { width: 100%; height: 100%; display: flex; background: #131c25f5; border: 1px solid #34414a; border-right: 0; border-radius: 13px 0 0 13px; overflow: hidden; }
  button { font: inherit; cursor: pointer; border: 0; }
  button:focus-visible { outline: 2px solid #62dfb9; outline-offset: -3px; }
  .rail { width: 55px; flex: 0 0 55px; height: 100%; display: flex; align-items: center; flex-direction: column; padding: 16px 3px 9px; }
  .expanded .rail { background: #101821; border-left: 1px solid #2c3a44; }
  .identity { width: 33px; height: 33px; border: 1px solid #42605c; border-radius: 10px; background: #243b37; color: #83edc8; display: grid; place-items: center; font: 700 16px Consolas, monospace; }
  .codex { margin-top: 9px; font: 600 8px 'Segoe UI', sans-serif; letter-spacing: 0.9px; color: #b2c1c9; }
  .rail-usage { text-align: center; margin-top: 20px; }
  .rail-usage > span { display: block; color: #8c9fa9; font-size: 10px; }
  .rail-usage strong { display: block; margin-top: 5px; color: #f1f7f6; font: 600 12px Consolas, monospace; letter-spacing: -0.5px; }
  .rail-usage small { display: block; font-size: 7px; color: #8498a4; margin-top: 5px; letter-spacing: 0.7px; }
  .status { display: flex; gap: 4px; align-items: center; margin-top: auto; font-size: 9px; color: #94aaa8; }
  .status i, .local i { width: 5px; height: 5px; border-radius: 50%; background: #69dab3; }
  .waiting i { background: #d9b469; }
  .toggle { margin-top: 9px; width: 34px; height: 29px; border-radius: 8px; background: #25343e; color: #b9cbd3; font-size: 25px; line-height: 20px; }
  .toggle:hover, .refresh:hover { background: #344953; }
  .summary { flex: 1; min-width: 0; padding: 23px 22px 14px; display: flex; flex-direction: column; overflow-y: auto; }
  .summary, .model-list { scrollbar-width: thin; scrollbar-color: #405661 transparent; }
  header { display: flex; align-items: center; justify-content: space-between; }
  .eyebrow { color: #839da8; font-size: 9px; letter-spacing: 1.8px; }
  h1 { margin: 7px 0 0; font-size: 19px; font-weight: 600; }
  .local { display: flex; gap: 5px; align-items: center; font-size: 10px; color: #a3c1b9; border: 1px solid #35514d; border-radius: 20px; padding: 5px 8px; }
  .today { margin-top: 23px; }
  .today > span, .stats span { color: #9cafb9; font-size: 11px; }
  .today strong { display: block; margin-top: 7px; font-size: 29px; line-height: 35px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -1px; }
  .today small { display: block; font-size: 9px; color: #718996; margin-top: 4px; }
  .stats { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 8px; margin: 22px 0 18px; padding: 14px 0; border-top: 1px solid #2d3c47; border-bottom: 1px solid #2d3c47; }
  .stats span { font-size: 10px; display: block; }
  .stats b { display: block; margin-top: 7px; font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
  h2 { font-size: 11px; color: #a7bbc5; font-weight: 500; margin: 0 0 11px; }
  .models { min-height: 64px; }
  .model-list { max-height: 85px; overflow-y: auto; }
  .model { margin-bottom: 10px; }
  .model > div:first-child { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .model span { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 10px; }
  .model small { flex-shrink: 0; font-size: 9px; color: #8ea7b1; }
  .track { height: 3px; background: #2e3f49; margin-top: 6px; border-radius: 3px; }
  .track i { display: block; height: 100%; background: #71d9b6; border-radius: 3px; }
  .models p { font-size: 11px; color: #8da4af; line-height: 1.5; }
  .cost { display: flex; align-items: center; justify-content: space-between; margin-top: 17px; font-size: 11px; color: #93aeb9; }
  .cost b { color: #8be1bf; font-size: 14px; font-weight: 500; }
  .note { display: block; font-size: 9px; line-height: 1.5; color: #728d9c; margin-top: 7px; }
  footer { display: flex; gap: 8px; margin-top: auto; padding-top: 17px; }
  .dashboard { flex: 1; display: flex; align-items: center; justify-content: space-between; padding: 10px 13px; border-radius: 8px; color: #173b30; background: #8ae3be; font-size: 12px; font-weight: 600; }
  .dashboard:hover { background: #a3eccf; }
  .dashboard:disabled { opacity: .6; cursor: wait; }
  .refresh { width: 36px; border-radius: 8px; background: #273941; color: #bfd4dc; font-size: 20px; }
  .updated { text-align: right; margin-top: 8px; color: #6e8a99; font-size: 9px; }
  .error { color: #efb58d; font-size: 11px; line-height: 1.4; margin: 8px 0; }
</style>
