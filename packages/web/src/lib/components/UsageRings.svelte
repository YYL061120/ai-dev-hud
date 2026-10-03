<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte'
  import { fade, fly } from 'svelte/transition'
  import type { UsageRing, UsageRingsSnapshot } from '../../../../core/src/usage-rings.js'
  export let snapshot: UsageRingsSnapshot
  export let language = 'zh'
  export let compact = false
  export let detailsEnabled = true
  export let bridgeHeld = false
  let pointerInside = false, previousBridge = false
  export let activeKey: string | null = null
  export let visible = true
  export let density: 'page' | 'hud' = 'page'
  const dispatch = createEventDispatcher<{ select: string }>()
  let root: HTMLElement, popupTop = 0, popupHeight = 288, popupWidth = 300, popupLeft = 0, pointer = 50, mounted = false, reduced = false, pageVisible = true
  let frame = 0, closeTimer: ReturnType<typeof setTimeout> | undefined
  let inputMode: 'pointer' | 'keyboard' = 'pointer'
  let positionedKey: string | null = null
  let values: Record<string, { tokens: number; share: number }> = {}
  let motionInput: { snapshot: UsageRingsSnapshot; visible: boolean; foreground: boolean; reduced: boolean } | undefined
  const compactNumber = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : Math.round(n).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')
  const number = (n: number) => Math.round(n).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')
  const words = (zh: string, en: string) => language === 'zh' ? zh : en
  const color = (r: UsageRing) => r.kind === 'total' ? '#e7bd67' : r.key === snapshot.currentDeviceKey ? '#5bc9bd' : snapshot.devices.filter(device => device.key !== snapshot.currentDeviceKey).findIndex(device => device.key === r.key) % 2 ? '#a499bd' : '#e89968'
  const label = (r: UsageRing) => r.kind === 'total' ? words('总用量', 'All usage') : r.key === snapshot.currentDeviceKey ? words('本机', 'This device') : `${r.platform === 'darwin' ? 'Mac' : r.platform === 'win32' ? 'Windows' : words('设备', 'Device')} · ${r.key.slice(0, 6)}`
  const source = (r: UsageRing) => r.source === 'aggregate' ? words('仅含已采集的设备', 'Collected devices only') : r.source === 'local' ? words('本机采集', 'Local records') : r.source === 'mixed' ? words('本机 + 手动导入', 'Local + imported') : words('手动导入 · 非实时连接', 'Imported · not live')
  const dateRange = () => snapshot.period === 'lifetime' ? `${words('累计 · 截至 ', 'Lifetime · through ')}${new Date(snapshot.until - 1).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}` : `${new Date(snapshot.since).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')} — ${new Date(snapshot.until - 1).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}`
  const cost = (r: { estimatedCost?: number | null; cost?: number | null; missingEstimates: number }) => {
    const value = r.estimatedCost === undefined ? r.cost : r.estimatedCost
    return value === null || value === undefined ? words('无估值', 'No estimate') : `${new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value)}${r.missingEstimates ? words(' · 部分估值', ' · partial estimate') : ''}`
  }
  $: rings = snapshot ? [snapshot.total, ...snapshot.devices] : []
  $: active = rings.find(r => r.key === activeKey)
  $: if (mounted && root && active && activeKey !== positionedKey) {
    positionedKey = activeKey
    const button = root.querySelector(`[data-key="${activeKey}"]`)
    if (button) position(button as HTMLElement)
  }
  $: if (mounted) updateMotion(snapshot, visible, pageVisible, reduced)
  function updateMotion(next: UsageRingsSnapshot, shown: boolean, foreground: boolean, reduce: boolean) {
    if (motionInput?.snapshot === next && motionInput.visible === shown && motionInput.foreground === foreground && motionInput.reduced === reduce) return
    motionInput = { snapshot: next, visible: shown, foreground, reduced: reduce }
    animate(next)
  }
  function animate(next: UsageRingsSnapshot) {
    cancelAnimationFrame(frame); frame = 0
    const target = Object.fromEntries([next.total, ...next.devices].map(r => [r.key, { tokens: r.tokens, share: r.kind === 'total' ? 1 : r.share ?? 0 }]))
    if (reduced || !visible || !pageVisible) { values = target; return }
    const from = values, started = performance.now()
    const tick = (time: number) => {
      if (!mounted || !visible || !pageVisible) { values = target; frame = 0; return }
      const t = Math.min(1, (time - started) / 320), eased = 1 - (1 - t) ** 3
      values = Object.fromEntries(Object.entries(target).map(([key, to]) => [key, { tokens: (from[key]?.tokens ?? 0) + (to.tokens - (from[key]?.tokens ?? 0)) * eased, share: (from[key]?.share ?? 0) + (to.share - (from[key]?.share ?? 0)) * eased }]))
      if (t < 1) frame = requestAnimationFrame(tick); else { values = target; frame = 0 }
    }
    frame = requestAnimationFrame(tick)
  }
  function stopClosing() { clearTimeout(closeTimer) }
  function focusOut(event: FocusEvent) { if (!root.contains(event.relatedTarget as Node | null)) closeLater() }
  function keydown(event: KeyboardEvent) { inputMode = 'keyboard'; if (event.key === 'Escape' && activeKey) { activeKey = null; event.stopPropagation() } }
  $: if (bridgeHeld !== previousBridge) { previousBridge = bridgeHeld; if (bridgeHeld) stopClosing(); else if (!pointerInside) closeLater() }
  function closeLater() { stopClosing(); if (bridgeHeld) return; closeTimer = setTimeout(() => activeKey = null, 220) }
  function open(r: UsageRing, button: HTMLElement) {
    stopClosing()
    if (!detailsEnabled) return
    activeKey = r.key
    position(button)
  }
  function reposition() {
    const button = root?.querySelector(`[data-key="${activeKey}"]`)
    if (button) position(button as HTMLElement)
  }
  function position(button: HTMLElement) {
    const parent = root.getBoundingClientRect(), bounds = button.getBoundingClientRect(), width = Math.min(300, parent.width)
    const center = bounds.left - parent.left + bounds.width / 2
    if (compact && density === 'hud') {
      popupWidth = Math.min(300, innerWidth - 76)
      popupHeight = Math.min(innerHeight - 24, (rings.find(r => r.key === activeKey)?.models.length ?? 0) > 2 ? 320 : 288)
      popupLeft = -popupWidth - 12
      popupTop = Math.max(-parent.top + 12, Math.min(innerHeight - parent.top - popupHeight - 12, bounds.top - parent.top - 32))
      pointer = Math.max(18, Math.min(popupHeight - 18, bounds.top - parent.top + bounds.height / 2 - popupTop))
      return
    }
    popupLeft = Math.max(0, Math.min(parent.width - width, center - width / 2)); pointer = Math.max(16, Math.min(width - 16, center - popupLeft))
  }
  function activate(r: UsageRing, button: HTMLElement) {
    if (!detailsEnabled) { dispatch('select', r.key); return }
    if (activeKey === r.key) activeKey = null; else open(r, button)
  }
  onMount(() => {
    mounted = true; pageVisible = !document.hidden
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => { reduced = motion.matches }
    const visibility = () => { pageVisible = !document.hidden; if (!pageVisible) activeKey = null }
    changed(); motion.addEventListener('change', changed); document.addEventListener('visibilitychange', visibility)
    const geometry = new ResizeObserver(() => {
      if (!mounted || !activeKey || !detailsEnabled) return
      const button = root.querySelector(`[data-key="${activeKey}"]`)
      if (button) position(button as HTMLElement)
    })
    geometry.observe(root)
    animate(snapshot)
    return () => { geometry.disconnect(); motion.removeEventListener('change', changed); document.removeEventListener('visibilitychange', visibility) }
  })
  onDestroy(() => { mounted = false; cancelAnimationFrame(frame); stopClosing() })
</script>

<svelte:window on:keydown={(event) => { inputMode = 'keyboard'; if (event.key === 'Escape' && activeKey) { activeKey = null; event.stopImmediatePropagation() } }} on:pointerdown={() => inputMode = 'pointer'} />
<div class="ring-group" role="group" aria-label={words('设备用量圈', 'Device usage rings')} class:compact class:hud={density === 'hud'} bind:this={root} data-testid="usage-rings" on:mouseenter={() => { pointerInside = true; stopClosing() }} on:mouseleave={() => { pointerInside = false; closeLater() }} on:focusout={focusOut}>
  <div class="ring-dock" on:scroll={reposition}>
    {#each rings as ring (ring.key)}
      <button class="unit" type="button" style={`--ring-color:${color(ring)}`} data-testid="usage-ring" data-key={ring.key} data-kind={ring.kind} data-tokens={ring.tokens} data-share={ring.share ?? ''} aria-label={`${label(ring)} · ${number(ring.tokens)} tokens`} aria-expanded={detailsEnabled && activeKey === ring.key} on:pointerenter={(event) => { if (event.pointerType !== 'touch') open(ring, event.currentTarget) }} on:focus={(event) => { if (inputMode === 'keyboard') open(ring, event.currentTarget) }} on:keydown={keydown} on:click={(event) => activate(ring, event.currentTarget)}>
        <svg class="circle" viewBox="0 0 40 40" aria-hidden="true">
          <circle class="track" cx="20" cy="20" r="17" />
          <circle class="arc" cx="20" cy="20" r="17" pathLength="100" stroke-dasharray="100" stroke-dashoffset={100 * (1 - (values[ring.key]?.share ?? (ring.kind === 'total' ? 1 : ring.share ?? 0)))} />
          {#if ring.kind === 'total'}<path class="icon" d="M24 13H15l6 7-6 7h9" />{:else if ring.platform === 'darwin'}<path class="icon" d="M13 14h14v11H13zM10 27h20" />{:else}<path class="icon" d="M12 13h16v12H12zM20 25v4m-5 0h10" />{/if}
        </svg>
        <strong>{compactNumber(values[ring.key]?.tokens ?? ring.tokens)}</strong>
        <span>{label(ring)}</span>
      </button>
    {/each}
  </div>
  {#if detailsEnabled && active && visible && pageVisible}
    <section class="detail" data-testid="ring-detail" aria-label={label(active)} style={`left:${popupLeft}px;--popup-top:${popupTop}px;--popup-left:${popupLeft}px;--popup-width:${popupWidth}px;--popup-height:${popupHeight}px;--ring-color:${color(active)};--pointer:${pointer}px`} on:mouseenter={stopClosing} transition:fly={{ x: reduced ? 0 : compact ? 12 : 0, y: reduced || compact ? 0 : -5, duration: reduced ? 0 : 240 }}>
      {#key active.key}
      <div class="detail-body" in:fade={{ duration: reduced ? 0 : 160 }} out:fade={{ duration: reduced ? 0 : 120 }}>
      <header><div><h3>{label(active)}</h3><small>{dateRange()}</small></div><button class="close" on:keydown={keydown} on:click={() => activeKey = null} aria-label={words('关闭明细', 'Close details')}>×</button></header>
      <div class="big">{number(active.tokens)}<small>tokens</small></div>
      <p class="muted">{active.kind === 'total' ? words('总量标识 · 非订阅额度', 'Total marker · not a quota') : active.share === null ? words('暂无占比分母', 'No share denominator') : `${(active.share * 100).toFixed(1)}% · ${words('同周期已采集总量', 'of collected usage this period')}`}</p>
      <div class="provenance"><span>{source(active)}</span>{#if active.source === 'imported' || active.source === 'mixed'}<small>{words('最近接收：', 'Last received: ')}{active.importedAt === null ? words('未知', 'Unknown') : new Date(active.importedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small>{/if}</div>
      <p class="muted">{number(active.sessions)} {words('会话', 'sessions')} · {number(active.records)} {words('用量记录', 'usage records')}</p>
      <div class="metrics"><span>{words('API 等价费用', 'API-equivalent cost')}</span><b>{cost(active)}</b></div>
      {#if active.missingEstimates}<p class="muted">{number(active.missingEstimates)} {words('条记录无估值', 'records without an estimate')}</p>{/if}
      <div class="model-list">{#each active.models as model}<div class="model"><div><span>{model.model}</span><b>{compactNumber(model.tokens)}</b></div><small>{model.tool} · {model.provider} · {cost(model)}</small><div class="bar"><i style:width={`${active.tokens ? model.tokens / active.tokens * 100 : 0}%`}></i></div></div>{:else}<p class="muted">{words('该周期无已采集记录', 'No collected records this period')}</p>{/each}</div>
      </div>
      {/key}
    </section>
  {/if}
</div>

<style>
  .ring-group { position:relative; color:#f5f5f7; font-family:inherit; }
  .ring-dock { display:flex; flex-wrap:wrap; align-items:start; justify-content:center; gap:20px; padding:18px 20px; border-radius:23px; background:#151517; box-shadow:0 10px 28px #0002; }
  .unit { min-width:66px; max-width:110px; flex:1 1 66px; display:flex; flex-direction:column; align-items:center; padding:0; border:0; border-radius:10px; background:transparent; color:inherit; cursor:pointer; touch-action:manipulation; font:inherit; }
  .circle { width:40px; height:40px; display:block; margin-bottom:9px; overflow:visible; }
  circle { fill:none; stroke-width:2.3; } .track { stroke:#363639; } .arc { stroke:var(--ring-color); stroke-linecap:round; transform:rotate(-90deg); transform-origin:20px 20px; } .icon { fill:none; stroke:#f3f3f5; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round; }
  strong { font-size:20px; line-height:1.2; font-weight:650; font-variant-numeric:tabular-nums; letter-spacing:-.6px; } .unit > span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#99999f; font-size:10px; margin-top:5px; }
  .unit:focus-visible { outline:2px solid var(--ring-color); outline-offset:5px; } .unit[aria-expanded=true] .icon { stroke:var(--ring-color); }
  .detail { transition:left 280ms cubic-bezier(.2,.8,.2,1),top 280ms cubic-bezier(.2,.8,.2,1),border-radius 280ms,width 280ms,height 280ms; position:absolute; top:calc(100% + 11px); width:min(300px,100%); z-index:20; padding:18px; box-sizing:border-box; border-radius:18px; background:#1b1b1e; color:#f3f3f5; box-shadow:0 18px 50px #0005; text-align:left; }
  .detail::before { transition:left 280ms,top 280ms; border-radius:3px; content:''; position:absolute; top:-5px; left:calc(var(--pointer) - 5px); width:10px; height:10px; background:#1b1b1e; transform:rotate(45deg); }
  header { display:flex; justify-content:space-between; align-items:start; gap:8px; } h3 { margin:0 0 4px; font-size:13px; font-weight:600; } small,.muted { color:#96969f; font-size:10px; line-height:1.5; } .close { border:0; background:none; color:#a5a5ab; cursor:pointer; padding:0 2px; font-size:20px; }
  .big { color:var(--ring-color); font-size:29px; font-weight:650; margin:17px 0 3px; font-variant-numeric:tabular-nums; letter-spacing:-1px; } .big small { margin-left:7px; font-size:11px; letter-spacing:0; } p { margin:4px 0; } .provenance { border-top:1px solid #343438; margin-top:13px; padding-top:12px; color:#b3b3bc; font-size:10px; } .provenance small { display:block; margin-top:4px; }
  .metrics { display:flex; justify-content:space-between; gap:8px; margin-top:12px; font-size:10px; } .metrics span { color:#a4a4ad; } b { font-weight:500; } .model-list { margin-top:14px; max-height:148px; overflow:auto; overscroll-behavior:contain; } .model { margin:0 0 12px; } .model > div:first-child { display:flex; gap:10px; justify-content:space-between; font-size:11px; } .model span { min-width:0; overflow:hidden; text-overflow:ellipsis; } .model small { display:block; margin-top:3px; } .bar { height:2px; background:#37373c; border-radius:2px; margin-top:6px; } .bar i { display:block; height:100%; background:var(--ring-color); border-radius:2px; }
  .compact .ring-dock { flex-direction:column; gap:13px; padding:0; background:none; box-shadow:none; } .compact .unit { width:50px; min-width:0; flex:0 0 auto; } .compact .circle { width:29px; height:29px; margin-bottom:4px; } .compact strong { font-size:11px; letter-spacing:-.2px; } .compact .unit > span { font-size:8px; margin-top:3px; }
  .hud:not(.compact) .ring-dock { padding:13px 10px; gap:10px; max-height:104px; overflow-y:auto; overscroll-behavior:contain; } .hud:not(.compact) .unit { min-width:48px; flex-basis:48px; } .hud:not(.compact) .circle { width:34px; height:34px; margin-bottom:7px; } .hud:not(.compact) strong { font-size:16px; } .hud .detail { position:relative; top:auto; left:0 !important; margin-top:11px; padding:14px; } .hud .detail-body { max-height:192px; overflow-y:auto; overscroll-behavior:contain; } .hud .model-list { max-height:92px; }
  .detail-body,.model-list,.hud .ring-dock { scrollbar-width:thin; scrollbar-color:#53535c transparent; }
  .detail-body::-webkit-scrollbar,.model-list::-webkit-scrollbar,.hud .ring-dock::-webkit-scrollbar { width:5px; }
  .detail-body::-webkit-scrollbar-thumb,.model-list::-webkit-scrollbar-thumb,.hud .ring-dock::-webkit-scrollbar-thumb { background:#53535c; border-radius:5px; }
  .detail::after { content:''; position:absolute; top:-12px; left:0; width:100%; height:12px; }
  .detail-body { grid-area:1 / 1; min-width:0; }
  .detail { display:grid; }
  .compact.hud .ring-dock { max-height:144px; overflow-y:auto; scrollbar-width:none; }
  .compact.hud .detail { position:absolute; left:var(--popup-left) !important; top:var(--popup-top); margin:0; width:var(--popup-width); height:var(--popup-height); grid-template-rows:minmax(0,1fr); border-radius:24px; }
  .compact.hud .detail::before { top:calc(var(--pointer) - 5px); left:auto; right:-5px; }
  .compact.hud .detail-body { height:100%; max-height:100%; min-height:0; }
  .compact.hud .detail::after { content:''; position:absolute; left:auto; right:-14px; width:14px; top:0; height:100%; }
  @media(prefers-reduced-motion:reduce) { .unit,.detail,.detail::before,.arc { animation:none; transition:none; } }
</style>
