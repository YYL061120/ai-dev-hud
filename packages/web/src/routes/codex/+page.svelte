<script lang="ts">
  import { onMount } from 'svelte'
  import { lang, t } from '$lib/i18n.js'
  import { projectApi } from '$lib/local-control'
  import type { LocalProject, ProjectInspection, ProjectDiscovery, CodexLauncherStatus, ProjectTask } from '../../../../core/src/local-control.js'
  let projects: LocalProject[] = []
  let directory = '', busy = false, error = '', notice = '', prompt = '', goal = ''
  let selected: ProjectInspection | null = null
  let discovery: ProjectDiscovery | null = null
  let document: { path: string; content: string } | null = null
  let codex: CodexLauncherStatus = { available: false }
  let task: ProjectTask = 'continue'
  const tasks: ProjectTask[] = ['continue', 'feature', 'debug', 'architecture', 'review', 'new-project']
  async function operation(work: () => Promise<void>) {
    if (busy) return
    busy = true; error = ''; notice = ''
    try { await work() } catch (e) { error = e instanceof Error ? e.message : $t('control.error') } finally { busy = false }
  }
  async function refresh() { projects = (await projectApi.list()).projects; codex = await projectApi.status() }
  async function inspect(id: string) { selected = await projectApi.inspect(id); prompt = ''; document = null }
  async function register(path: string) { const result = await projectApi.register(path); await refresh(); await inspect(result.project.id) }
  async function unregister(id: string) { await projectApi.unregister(id); if (selected?.id === id) { selected = null; prompt = ''; document = null }; await refresh() }
  async function preview() { if (!selected) return; prompt = (await projectApi.kickoff(selected.id, task, $lang)).prompt; if (task === 'new-project' && goal.trim()) prompt += `\n${goal.trim()}` }
  onMount(() => { void operation(refresh) })
</script>

<svelte:head><title>{$t('control.home')} — AI Dev HUD</title></svelte:head>
<div class="page-header"><h1>{$t('control.home')}</h1><p>{$t('control.desc')}</p></div>
{#if error}<p role="alert" class="error">{error}</p>{/if}
{#if notice}<p role="status">{notice}</p>{/if}
<section class="card">
  <label for="project-directory">{$t('control.directory')}</label>
  <input id="project-directory" data-testid="project-directory" bind:value={directory} autocomplete="off" placeholder="C:\Projects\MyProject" />
  <div class="actions">
    <button data-testid="register-project" disabled={busy || !directory.trim()} on:click={() => operation(() => register(directory))}>{$t('control.register')}</button>
    <button data-testid="discover-projects" disabled={busy || !directory.trim()} on:click={() => operation(async () => { discovery = await projectApi.discover(directory) })}>{$t('control.discover')}</button>
    <button disabled={busy} on:click={() => operation(refresh)}>{$t('control.refresh')}</button>
  </div>
  <p class="hint">{$t('control.discoveryHint')}</p>
  {#if discovery}<h2>{$t('control.found')} ({discovery.visited})</h2>{#if discovery.truncated}<p>{$t('control.scanLimit')}</p>{/if}
    {#each discovery.projects as item}<div class="row"><span>{item.name} · {item.engine}<small>{item.path}</small></span><button disabled={busy} on:click={() => operation(() => register(item.path))}>{$t('control.register')}</button></div>{/each}
  {/if}
</section>
<section class="card"><h2>{$t('control.projects')}</h2>
  {#if !projects.length}<p>{$t('control.empty')}</p>{/if}
  {#each projects as project}<div class="row" data-testid="registered-project"><span>{project.name}<small>{project.path}</small></span><div class="actions"><button disabled={busy} on:click={() => operation(() => inspect(project.id))}>{$t('control.inspect')}</button><button disabled={busy} on:click={() => operation(() => unregister(project.id))}>{$t('control.unregister')}</button></div></div>{/each}
</section>
{#if selected}
<section class="card" data-testid="project-detail"><h2>{selected.name}</h2>
  <p>{$t('control.engine')}: {selected.engine} · {$t('control.branch')}: {selected.git.branch ?? $t('control.unavailable')} · {selected.git.dirty === null ? $t('control.unavailable') : selected.git.dirty ? $t('control.dirty') : $t('control.clean')}</p>
  {#if !selected.available}<p>{$t('control.unavailable')}</p>{/if}
  <h3>{$t('control.documents')}</h3>
  {#each selected.documents as doc}<div class="row"><span>{doc.path}</span><button disabled={busy || !doc.available} on:click={() => operation(async () => { if (selected) document = await projectApi.document(selected.id, doc.key) })}>{doc.available ? $t('control.read') : $t('control.unavailable')}</button></div>{/each}
  {#if document}<h3>{document.path}</h3><pre data-testid="project-document">{document.content}</pre>{/if}
  <p class="hint" data-testid="session-metadata-status">{$t(`control.session-${selected.recentSession.reason}`)} {selected.recentSession.version ?? ''} · {$t('control.sessionSource')}</p>
  <label for="project-task">{$t('control.task')}</label><select id="project-task" bind:value={task} on:change={() => { prompt = '' }}>{#each tasks as value}<option value={value}>{$t(`control.${value}`)}</option>{/each}</select>
  {#if task === 'new-project'}<p>{$t('control.newHint')}</p><label for="project-goal">{$t('control.newGoal')}</label><input id="project-goal" bind:value={goal} maxlength="4000" />{/if}
  <div class="actions"><button data-testid="kickoff-preview" disabled={busy || !selected.available} on:click={() => operation(preview)}>{$t('control.preview')}</button>{#if prompt}<button data-testid="copy-kickoff" on:click={() => operation(async () => { await navigator.clipboard.writeText(prompt); notice = $t('control.copied') })}>{$t('control.copy')}</button>{/if}</div>
  {#if prompt}<pre data-testid="kickoff-content">{prompt}</pre>{/if}
  <p class="hint">{$t('control.launchHint')}</p>
  <p>{codex.version ?? codex.reason ?? $t('control.unavailable')}</p>
  <button data-testid="launch-codex" disabled={busy || !codex.available || !selected.available} on:click={() => operation(async () => { if (selected) await projectApi.launch(selected.id); notice = $t('control.launched') })}>{$t('control.launch')}</button>
</section>
{/if}
<style>
  .card { padding:20px; margin-bottom:16px; border:1px solid var(--border-subtle); border-radius:12px; background:var(--surface); }
  h2 { font-size:18px; margin:0 0 14px; } h3 { font-size:14px; margin:18px 0 8px; }
  label { display:block; font-size:13px; margin:8px 0; }
  input, select { width:100%; box-sizing:border-box; padding:10px; border:1px solid var(--border-subtle); border-radius:6px; background:var(--bg); color:var(--text); }
  button { border:1px solid var(--border-subtle); border-radius:6px; padding:8px 12px; background:var(--bg); color:var(--text); cursor:pointer; } button:disabled { opacity:.45; cursor:default; }
  .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; } .row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 0; border-bottom:1px solid var(--border-subtle); }
  small { display:block; overflow-wrap:anywhere; color:var(--text-secondary); margin-top:5px; } .hint { font-size:12px; color:var(--text-secondary); line-height:1.6; } .error { color:#e15c64; }
  pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:360px; overflow:auto; padding:12px; background:var(--bg); border-radius:6px; font-size:12px; }
  @media(max-width:600px) { .row { align-items:flex-start; flex-direction:column; } }
</style>
