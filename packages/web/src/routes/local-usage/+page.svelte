<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { lang, getLocale, t } from '$lib/i18n.js'
  import { usageApi } from '$lib/usage-metadata'
  import type { UsageOverview, UsageTotals } from '../../../../core/src/usage-metadata.js'
  import type { UsageExportProgress } from '../../../../core/src/usage-transfer.js'
  import { importUsageFile, type FileImportProgress } from '$lib/usage-file'
  import { beginUsageExport } from '$lib/usage-export-lifecycle'
  import UsageRings from '$lib/components/UsageRings.svelte'
  import ClaudeIntegration from '$lib/components/ClaudeIntegration.svelte'
  import { invalidateSubscriptionSnapshot } from '../../../../core/src/usage-rings.js'
  let data: UsageOverview | null = null
  let busy = false, error = '', period = 'thirty', device = '', project = ''
  let imported: FileImportProgress | null = null, exported: UsageExportProgress | null = null
  let cancelRequested = false, mounted = true, exportCreating = false
  let devices: string[] = [], projects: string[] = []
  const periods = ['today', 'seven', 'thirty', 'lifetime'] as const
  const number = (value: number, language: string) => value.toLocaleString(getLocale(language))
  const money = (value: number, language: string) => value.toLocaleString(getLocale(language), { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 })
  const estimate = (value: UsageTotals, language: string) => value.estimatedCost === null || value.estimatedCost === undefined ? (language === 'zh' ? '金额未知' : 'Cost unknown') : money(value.estimatedCost, language) + (value.missingEstimates ? (language === 'zh' ? ' · 部分估算' : ' · partial estimate') : '')
  async function operation(work: () => Promise<void>) { if (busy) return; busy = true; error = ''; try { await work() } catch (e) { error = e instanceof Error ? e.message : $t('control.error') } finally { busy = false } }
  let quotaEpoch = 0
  function invalidateClaude() {
    if (data) data = { ...data, ...(data.rings ? { rings: invalidateSubscriptionSnapshot(data.rings, "claude-code") } : {}), ...(data.ringPeriods ? { ringPeriods: Object.fromEntries(Object.entries(data.ringPeriods).map(([key, value]) => [key, invalidateSubscriptionSnapshot(value, "claude-code")])) as UsageOverview["ringPeriods"] } : {}) }
  }
  async function claudeQuotaChanged() { quotaEpoch++; invalidateClaude(); await refresh() }
  async function refresh() {
    const epoch = quotaEpoch
    try {
      const next = await usageApi.overview(period, device, project)
      data = next
      if (epoch !== quotaEpoch) invalidateClaude()
      const all = await usageApi.overview('lifetime', '', '')
      devices = all.devices.map(r => r.key); projects = all.projects.map(r => r.key)
    } catch (e) {
      if (data) data = { ...data, ...(data.rings ? { rings: invalidateSubscriptionSnapshot(data.rings) } : {}), ...(data.ringPeriods ? { ringPeriods: Object.fromEntries(Object.entries(data.ringPeriods).map(([key, value]) => [key, invalidateSubscriptionSnapshot(value)])) as UsageOverview['ringPeriods'] } : {}) }
      throw e
    }
  }
  async function exportMetadata() {
    exportCreating = true
    let id: string | undefined
    try {
      id = await beginUsageExport(usageApi, () => !mounted || cancelRequested, value => exported = value, jobId => {
        const link = document.createElement('a')
        link.href = `/api/local/usage/export-jobs/${jobId}/file`; link.download = 'ai-dev-hud-usage-metadata-v1.jsonl'; link.click()
      })
    } finally { exportCreating = false }
    if (!id) return
    try {
      while (mounted && ['pending', 'running'].includes(exported.state)) {
        await new Promise(resolve => setTimeout(resolve, 300))
        if (cancelRequested) exported = await usageApi.cancelExport(id)
        else exported = await usageApi.exportStatus(id)
      }
    } catch (e) {
      await usageApi.cancelExport(id).catch(() => {})
      exported = { ...exported, state: 'failed' }
      throw e
    }
  }
  async function startExport() {
    if (busy || !mounted) return
    cancelRequested = false; imported = null; exported = null
    await operation(exportMetadata)
  }
  async function importFile(event: Event) {
    const input = event.target as HTMLInputElement, file = input.files?.[0]
    if (!file) return
    imported = null; exported = null; cancelRequested = false
    await operation(async () => {
      imported = await importUsageFile(file, usageApi.import, () => cancelRequested || !mounted, value => imported = value)
      if (imported.state === 'failed') error = imported.message ?? $t('control.error')
      await refresh()
    })
    input.value = ''
  }
  async function cancelTransfer() {
    cancelRequested = true
    if (exported && ['pending', 'running'].includes(exported.state)) {
      try { exported = await usageApi.cancelExport(exported.id) }
      catch (e) { error = e instanceof Error ? e.message : $t('control.error') }
    }
  }
  onMount(() => {
    void operation(refresh)
    const timer = setInterval(() => { if (mounted && !busy && !document.hidden) void operation(refresh) }, 15_000)
    return () => clearInterval(timer)
  })
  onDestroy(() => { mounted = false; cancelRequested = true; if (exported && ['pending', 'running'].includes(exported.state)) void usageApi.cancelExport(exported.id).catch(() => {}) })
</script>
<svelte:head><title>{$t('control.usage')} — AI Dev HUD</title></svelte:head>
<div class="page-header"><h1>{$t('control.usage')}</h1><p>{$t('control.privacy')}</p></div>
<ClaudeIntegration language={$lang} onQuotaChange={claudeQuotaChanged} />
{#if error}<p role="alert" class="error">{error}</p>{/if}
<section class="card actions">
  <button data-testid="usage-export" disabled={busy} on:click={startExport}>{$t('control.export')}</button>
  <label class="upload">{$t('control.import')}<input data-testid="usage-import" type="file" accept=".json,.jsonl,application/json,application/x-ndjson" disabled={busy} on:change={importFile} /></label>
  <button disabled={busy} on:click={() => operation(refresh)}>{$t('control.refresh')}</button>
  <p class="hint">{$t('control.transferHint')}</p>
</section>
{#if busy && (exportCreating || imported?.state === 'running' || exported && ['pending','running'].includes(exported.state))}<button data-testid="transfer-cancel" disabled={cancelRequested} on:click={cancelTransfer}>{$t('control.cancelTransfer')}</button>{/if}
{#if exported}<p data-testid="export-progress" role="status">{$t(`control.transfer-${exported.state}`)} · {number(exported.records, $lang)} {$t('control.records')} · {number(exported.chunks, $lang)} {$t('control.chunks')}</p>{/if}
{#if imported}<pre data-testid="import-result" role="status">{$t(`control.transfer-${imported.state}`)} · {number(imported.records, $lang)} {$t('control.confirmedRecords')} · {number(imported.chunks, $lang)} {$t('control.chunks')} · {$t('control.fileRead')} {Math.round(100 * imported.bytes / Math.max(1, imported.totalBytes))}%
{JSON.stringify(imported.result, null, 2)}</pre>{#if imported.state === 'failed' || imported.state === 'cancelled'}<p class="hint">{$t('control.partialImport')}{#if imported.uncertain} {$t('control.uncertainImport')}{/if}</p>{/if}{/if}
{#if data}
{#if data.rings}<section class="rings-section"><UsageRings snapshot={data.rings} language={$lang}/><p class="hint">{$lang === 'zh' ? 'Codex 为短期核验的账号共享额度，Claude 为短期会话观测（账号未核验）；虚线表示未知或过期。统计时段只筛选设备用量，未接入设备不等于用量为零。' : 'Codex shows a briefly verified shared-account observation; Claude shows a brief session observation with account unverified. Dashed tracks mean unknown or stale. The period filters device usage; unconnected devices do not mean zero usage.'}</p></section>{/if}
<div class="totals">{#each periods as p}<section class="card" data-testid={`usage-${p}`}><h2>{$t(`control.${p}`)}</h2><strong>{number(data.periods[p].tokens, $lang)}</strong><p>{$t('control.tokens')}</p><small>{estimate(data.periods[p], $lang)} · {number(data.periods[p].sessions, $lang)} {$t('control.sessionCount')} · {number(data.periods[p].records, $lang)} {$t('control.records')}</small></section>{/each}</div>
<section class="card"><label for="usage-period">{$t('control.filter')}</label><div class="actions">
  <select id="usage-period" bind:value={period} disabled={busy} on:change={() => operation(refresh)}>{#each periods as p}<option value={p}>{$t(`control.${p}`)}</option>{/each}</select>
  <select aria-label={$t('control.devices')} bind:value={device} disabled={busy} on:change={() => operation(refresh)}><option value="">{$t('control.all')} · {$t('control.devices')}</option>{#each devices as key}<option value={key}>{key.slice(0, 12)}{key === data.currentDeviceKey ? ' · local' : ''}</option>{/each}</select>
  <select aria-label={$t('control.projectUsage')} bind:value={project} disabled={busy} on:change={() => operation(refresh)}><option value="">{$t('control.all')} · {$t('control.projectUsage')}</option>{#each projects as key}<option value={key}>{key === 'unknown' ? $t('control.unknown') : data.projectLabels[key] ?? key.slice(0, 12)}</option>{/each}</select>
</div><p class="hint">{$t('control.approximate')}</p></section>
{#each [{ name: 'models', rows: data.models }, { name: 'devices', rows: data.devices }, { name: 'projectUsage', rows: data.projects }] as group}
<section class="card"><h2>{$t(`control.${group.name}`)}</h2><div class="table-wrap"><table><thead><tr><th>{$t('control.key')}</th><th>{$t('control.tokens')}</th><th>{$t('control.sessionCount')}</th><th>{$t('control.records')}</th><th>{$t('control.cost')}</th></tr></thead><tbody>{#each group.rows as row}<tr><td title={row.key}>{group.name === 'models' ? row.key : row.key === 'unknown' ? $t('control.unknown') : group.name === 'projectUsage' ? data.projectLabels[row.key] ?? row.key.slice(0, 12) : row.key.slice(0, 12)}</td><td>{number(row.tokens, $lang)}</td><td>{number(row.sessions, $lang)}</td><td>{number(row.records, $lang)}</td><td>{estimate(row, $lang)}</td></tr>{/each}</tbody></table></div></section>
{/each}
<section class="card"><h2>{$t('control.heatmap')}</h2><div class="heatmap">{#each data.heatmap as day}<div class="day" style={`--activity:${Math.min(0.8, 0.1 + Math.log10(day.tokens + 1) / 10)}`} title={`${day.day}: ${number(day.tokens, $lang)} tokens`}><small>{day.day}</small><span>{number(day.tokens, $lang)}</span></div>{/each}</div></section>
{:else if busy}<p>{$t('common.loading')}</p>{/if}
<style>
  .rings-section { margin:22px 0 26px; position:relative; z-index:2; } .rings-section > .hint { margin:10px 4px 0; }
  .card { padding:20px; margin-bottom:16px; border:1px solid var(--border-subtle); border-radius:12px; background:var(--surface); }
  h2 { font-size:16px; margin:0 0 14px; } strong { font-size:28px; } small, .hint { color:var(--text-secondary); font-size:12px; line-height:1.6; }
  .actions { display:flex; flex-wrap:wrap; gap:10px; align-items:center; } .actions .hint { width:100%; margin:0; }
  button, select, .upload { border:1px solid var(--border-subtle); border-radius:6px; padding:8px 12px; background:var(--bg); color:var(--text); } button, .upload { cursor:pointer; } button:disabled, input:disabled { opacity:.45; }
  input[type=file] { display:block; max-width:240px; margin-top:5px; }
  .totals { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; } .table-wrap { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; text-align:left; font-size:13px; } th,td { padding:10px; border-bottom:1px solid var(--border-subtle); } th { color:var(--text-secondary); }
  .heatmap { display:flex; flex-wrap:wrap; gap:6px; } .day { padding:8px; border-radius:5px; background:oklch(0.65 0.12 175 / var(--activity)); } .day small,.day span { display:block; }
  pre { white-space:pre-wrap; padding:12px; font-size:12px; } .error { color:#e15c64; }
  @media(max-width:900px) { .totals { grid-template-columns:repeat(2,minmax(0,1fr)); } } @media(max-width:500px) { .totals { grid-template-columns:1fr; } }
</style>
