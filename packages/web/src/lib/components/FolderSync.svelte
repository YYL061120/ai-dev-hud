<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte'
  import type { FolderSyncStatus } from '../../../../core/src/folder-sync.js'
  import { localRequest } from '$lib/local-control'
  const dispatch = createEventDispatcher()
  let status: FolderSyncStatus | null = null, directory = '', busy = false, error = '', mounted = true
  let timer: ReturnType<typeof setInterval> | undefined
  let lastSuccess: number | null = null
  const time = (value: number | null) => value ? new Date(value).toLocaleString('zh-CN') : '尚无'
  async function refresh() {
    const next = await localRequest<FolderSyncStatus>('folder-sync')
    if (!mounted) return
    if (lastSuccess !== null && next.lastSuccessAt !== lastSuccess) dispatch('changed')
    lastSuccess = next.lastSuccessAt; status = next
  }
  async function act(action: 'enable' | 'pause' | 'run') {
    if (busy) return
    busy = true; error = ''
    try {
      const next = await localRequest<FolderSyncStatus>(action === 'run' ? 'folder-sync/run' : 'folder-sync/configure', 'POST', action === 'run' ? {} : { directory, enabled: action === 'enable', confirm: true })
      if (mounted) { status = next; dispatch('changed') }
    } catch (e) { if (mounted) error = e instanceof Error ? e.message : '同步失败' }
    finally { if (mounted) busy = false }
  }
  onMount(() => { refresh().then(() => { if (!directory) directory = status?.directory ?? '' }).catch(e => { error = e.message }); timer = setInterval(() => { if (!busy) void refresh().catch(e => { error = e.message }) }, 5000) })
  onDestroy(() => { mounted = false; if (timer) clearInterval(timer) })
</script>
<section class="sync" data-testid="folder-sync">
  <h2>自动用量文件夹同步</h2>
  <p>选择 Google Drive 已离线可用的本地文件夹，再明确启用。只写入脱敏用量；每台机器保持独立身份。运行中的应用每 60 秒补扫。</p>
  <label for="sync-directory">本机同步目录（绝对路径）</label>
  <input id="sync-directory" type="text" bind:value={directory} disabled={busy || status?.enabled} placeholder="输入本机已选择的同步目录" />
  <div class="actions">
    <button disabled={busy || !!status?.enabled || !directory.trim()} on:click={() => act('enable')}>确认目录并启用脱敏同步</button>
    <button disabled={busy || !status?.enabled} on:click={() => act('pause')}>暂停同步</button>
    <button disabled={busy || !status?.enabled} on:click={() => act('run')}>立即同步</button>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if status}<p role="status">{status.enabled ? status.running ? '正在同步' : '已启用' : '已暂停'} · 最后成功补扫：{time(status.lastSuccessAt)} · 下次补扫：{time(status.nextRunAt)}</p>
    {#if status.error}<p class="error" role="alert">{status.error}</p>{/if}
    {#each status.issues as issue}<p class="error">{issue}</p>{/each}
    <p>最近一轮：发布 {status.published} 条 · 合并 {status.imported} 条。设备最后收到时间只表示文件已到达，不代表在线。</p>
    <ul>{#each status.devices as device}<li>{device.deviceKey.slice(0,12)} · 最后收到：{time(device.lastSeenAt)}</li>{/each}</ul>
  {/if}
</section>
<style>
  .sync { border:1px solid var(--border-subtle); background:var(--surface); border-radius:12px; padding:20px; margin:16px 0; }
  h2 { font-size:16px; margin:0 0 12px; } p,li { font-size:12px; line-height:1.6; color:var(--text-secondary); }
  label { display:block; font-size:13px; margin-bottom:8px; } input { box-sizing:border-box; width:100%; border:1px solid var(--border-subtle); padding:10px; border-radius:6px; background:var(--bg); color:var(--text); }
  .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:12px; } button { border:1px solid var(--border-subtle); border-radius:6px; padding:8px 12px; background:var(--bg); color:var(--text); cursor:pointer; } button:disabled { opacity:.45; } .error { color:#e15c64; }
</style>
