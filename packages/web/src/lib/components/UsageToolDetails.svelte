<script lang="ts">
  import { ringToolUsage, type UsageRing, type UsageRingsSnapshot } from '../../../../core/src/usage-rings.js'
  import { subscriptionWindowState } from '../../../../core/src/subscription-usage.js'
  export let ring: UsageRing
  export let snapshot: UsageRingsSnapshot
  export let language = 'zh'
  export let now = Date.now()
  export let expanded = false
  const words = (zh: string, en: string) => language === 'zh' ? zh : en
  const toolName = (tool: string) => tool === 'claude-code' ? 'Claude Code' : tool === 'codex' ? 'OpenAI / Codex' : tool
  const money = (value: number | null, partial: number) => value === null ? words('金额未知', 'Cost unknown') : new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value) + (partial ? words(' · 部分估算', ' · partial') : '')
  const number = (value: number) => value.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')
  const duration = (minutes: number | null) => minutes === null ? words('本期', 'Current window') : minutes % 1440 === 0 ? `${minutes / 1440} ${words('天窗口', 'day window')}` : minutes % 60 === 0 ? `${minutes / 60} ${words('小时窗口', 'hour window')}` : `${minutes} ${words('分钟窗口', 'minute window')}`
  $: local = ring.key === snapshot.currentDeviceKey && ring.source !== 'imported'
  $: groups = ringToolUsage(ring, local ? ['claude-code', 'codex'] : [])
</script>
<div class="tools" data-testid="tool-details">
  {#each groups as group (group.tool)}
    {@const subscription = local ? snapshot.subscriptions?.find(item => item.tool === group.tool) : undefined}
    <section class="tool" style={`--tool-color:${group.tool === 'claude-code' ? '#e89968' : group.tool === 'codex' ? '#f3f3f5' : '#9ab9d0'}`} data-tool={group.tool}>
      <header><h4>{toolName(group.tool)}</h4><span title={words('基于已采集用量的金额估算，非订阅账单', 'Estimated from collected usage; not a subscription bill')}>{money(group.cost, group.missingEstimates)}</span></header>
      {#if subscription?.windows.length}
        <p class="scope">{words('账号共享', 'Shared account')}</p>
        {#each subscription.windows as window}
          {@const status = subscriptionWindowState(subscription, window, now)}
          <div class="quota" data-quota-state={status}>
            <span>{window.bucketName ?? window.bucketId} · {duration(window.durationMinutes)}</span><b>{status === 'available' ? `${window.usedPercent}% ${words('已用', 'used')}` : status === 'stale' ? words('已过期 · 未知', 'Stale · unknown') : words('未知', 'Unknown')}</b>
            {#if window.resetsAt !== null}<small>{words('重置 ', 'Resets ')}{new Date(window.resetsAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>{/if}
          </div>
        {/each}
        {#if expanded}<small class="observation">{subscription.source} · {words('观测于 ', 'Observed ')}{new Date(subscription.observedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small>{/if}
      {:else}<p class="quota unknown">{local ? words('账号套餐额度未知', 'Account quota unknown') : words('设备未提供账号额度', 'Account quota unavailable for this device')}</p>{/if}
      <div class="model-list">
        {#each group.models as model}
          <div class="model"><span title={`${model.model} · ${model.provider}`}>{model.model}</span><b>{number(model.tokens)} <small>tokens</small></b><small title={words('用量金额估算', 'Estimated usage cost')}>{money(model.cost, model.missingEstimates)}</small></div>
        {:else}<p class="empty">{words('该统计时段无已采集用量', 'No collected usage in this period')}</p>{/each}
      </div>
    </section>
  {/each}
  {#if !groups.length}<p class="empty">{words('该统计时段无已采集用量', 'No collected usage in this period')}</p>{/if}
  {#if expanded}<p class="footnote">{words('统计时段只筛选设备用量，套餐按官方实际窗口重置；额度不按设备分配或相加。金额为估算，缺失不等于零。', 'The selected period filters device usage only. Quotas reset on official windows and are never allocated or added across devices. Costs are estimates; missing is not zero.')}</p>{/if}
</div>
<style>
  .tools { min-width:0; } .tool { padding:12px 0; border-top:1px solid #343438; } header { display:flex; align-items:baseline; justify-content:space-between; gap:9px; } h4 { margin:0; font-size:11px; color:var(--tool-color); font-weight:600; } header>span { font-size:10px; text-align:right; color:#d7d7de; } .scope,.empty,.unknown,.footnote,.observation { color:#96969f; font-size:10px; line-height:1.6; margin:5px 0; } .quota { display:flex; flex-wrap:wrap; gap:4px 8px; justify-content:space-between; font-size:10px; color:#96969f; margin-top:5px; } .quota b { color:#d7d7de; font-weight:500; } .quota small { width:100%; font-size:9px; } .model-list { margin-top:9px; } .model { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 9px; margin:9px 0; font-size:10px; } .model>span { min-width:0; overflow-wrap:anywhere; color:#dddde4; } .model b { font-weight:500; font-variant-numeric:tabular-nums; } .model small { color:#96969f; font-size:9px; } .model>small { grid-column:1 / -1; } .footnote { padding-top:10px; border-top:1px solid #343438; } .observation { overflow-wrap:anywhere; font-size:9px; }
</style>
