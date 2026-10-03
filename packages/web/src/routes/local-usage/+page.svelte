<script lang="ts">
  import { onMount } from 'svelte'
  import { lang, getLocale, t } from '$lib/i18n.js'
  import { usageApi } from '$lib/usage-metadata'
  import type { UsageOverview, MetadataImportResult } from '../../../../core/src/usage-metadata.js'
  let data: UsageOverview | null = null
  let busy = false, error = '', period = 'thirty', device = '', project = ''
  let result: MetadataImportResult | null = null
  let devices: string[] = [], projects: string[] = []
  const periods = ['today', 'seven', 'thirty', 'lifetime'] as const
  const number = (value: number, language: string) => value.toLocaleString(getLocale(language))
  const money = (value: number, language: string) => value.toLocaleString(getLocale(language), { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 })
  async function operation(work: () => Promise<void>) { if (busy) return; busy = true; error = ''; try { await work() } catch (e) { error = e instanceof Error ? e.message : $t('control.error') } finally { busy = false } }
  async function refresh() {
    data = await usageApi.overview(period, device, project)
    const all = await usageApi.overview('lifetime', '', '')
    devices = all.devices.map(r => r.key); projects = all.projects.map(r => r.key)
  }
  async function exportMetadata() {
    const transfer = await usageApi.export()
    const blob = new Blob([JSON.stringify(transfer, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = 'ai-dev-hud-usage-metadata-v1.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function importFile(event: Event) {
    const input = event.target as HTMLInputElement, file = input.files?.[0]
    if (!file) return
    result = null
    await operation(async () => { if (file.size > 10 * 1024 * 1024) throw new Error('Maximum metadata file size: 10 MiB'); result = await usageApi.import(JSON.parse(await file.text())); await refresh() })
    input.value = ''
  }
  onMount(() => { void operation(refresh) })
</script>
<svelte:head><title>{$t('control.usage')} — AI Dev HUD</title></svelte:head>
<div class="page-header"><h1>{$t('control.usage')}</h1><p>{$t('control.privacy')}</p></div>
{#if error}<p role="alert" class="error">{error}</p>{/if}
<section class="card actions">
  <button data-testid="usage-export" disabled={busy || !data} on:click={() => operation(exportMetadata)}>{$t('control.export')}</button>
  <label class="upload">{$t('control.import')}<input data-testid="usage-import" type="file" accept=".json,application/json" disabled={busy} on:change={importFile} /></label>
  <button disabled={busy} on:click={() => operation(refresh)}>{$t('control.refresh')}</button>
  <p class="hint">{$t('control.transferHint')}</p>
</section>
{#if result}<pre data-testid="import-result" role="status">{$t('control.imported')}: {JSON.stringify(result, null, 2)}</pre>{/if}
{#if data}
<div class="totals">{#each periods as p}<section class="card" data-testid={`usage-${p}`}><h2>{$t(`control.${p}`)}</h2><strong>{number(data.periods[p].tokens, $lang)}</strong><p>{$t('control.tokens')}</p><small>{money(data.periods[p].cost, $lang)} · {number(data.periods[p].sessions, $lang)} {$t('control.sessionCount')} · {number(data.periods[p].records, $lang)} {$t('control.records')}</small></section>{/each}</div>
<section class="card"><label for="usage-period">{$t('control.filter')}</label><div class="actions">
  <select id="usage-period" bind:value={period} disabled={busy} on:change={() => operation(refresh)}>{#each periods as p}<option value={p}>{$t(`control.${p}`)}</option>{/each}</select>
  <select aria-label={$t('control.devices')} bind:value={device} disabled={busy} on:change={() => operation(refresh)}><option value="">{$t('control.all')} · {$t('control.devices')}</option>{#each devices as key}<option value={key}>{key.slice(0, 12)}{key === data.currentDeviceKey ? ' · local' : ''}</option>{/each}</select>
  <select aria-label={$t('control.projectUsage')} bind:value={project} disabled={busy} on:change={() => operation(refresh)}><option value="">{$t('control.all')} · {$t('control.projectUsage')}</option>{#each projects as key}<option value={key}>{key === 'unknown' ? $t('control.unknown') : data.projectLabels[key] ?? key.slice(0, 12)}</option>{/each}</select>
</div><p class="hint">{$t('control.approximate')}</p></section>
{#each [{ name: 'models', rows: data.models }, { name: 'devices', rows: data.devices }, { name: 'projectUsage', rows: data.projects }] as group}
<section class="card"><h2>{$t(`control.${group.name}`)}</h2><div class="table-wrap"><table><thead><tr><th>{$t('control.key')}</th><th>{$t('control.tokens')}</th><th>{$t('control.sessionCount')}</th><th>{$t('control.records')}</th><th>{$t('control.cost')}</th></tr></thead><tbody>{#each group.rows as row}<tr><td title={row.key}>{group.name === 'models' ? row.key : row.key === 'unknown' ? $t('control.unknown') : group.name === 'projectUsage' ? data.projectLabels[row.key] ?? row.key.slice(0, 12) : row.key.slice(0, 12)}</td><td>{number(row.tokens, $lang)}</td><td>{number(row.sessions, $lang)}</td><td>{number(row.records, $lang)}</td><td>{money(row.cost, $lang)}</td></tr>{/each}</tbody></table></div></section>
{/each}
<section class="card"><h2>{$t('control.heatmap')}</h2><div class="heatmap">{#each data.heatmap as day}<div class="day" style={`--activity:${Math.min(0.8, 0.1 + Math.log10(day.tokens + 1) / 10)}`} title={`${day.day}: ${number(day.tokens, $lang)} tokens`}><small>{day.day}</small><span>{number(day.tokens, $lang)}</span></div>{/each}</div></section>
{:else if busy}<p>{$t('common.loading')}</p>{/if}
<style>
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
