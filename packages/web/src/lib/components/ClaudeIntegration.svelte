<script lang="ts">
  import { claudeStatuslineApi } from '../local-control'
  import type { ClaudeStatuslineStatus, ClaudeStatuslinePreview } from '../../../../core/src/claude-integration.js'
  export let language = 'zh'
  export let onQuotaChange: () => Promise<void> = async () => {}
  const words = (zh: string, en: string) => language === 'zh' ? zh : en
  let status: ClaudeStatuslineStatus | undefined, preview: ClaudeStatuslinePreview | undefined, busy = false, error = '', message = ''
  async function operation(work: () => Promise<void>) { if (busy) return; busy = true; error = ''; try { await work() } catch (e) { error = e instanceof Error ? e.message : words('本地操作失败，原设置保留。', 'Local operation failed; existing settings were preserved.') } finally { busy = false } }
  async function load() { status = await claudeStatuslineApi.status() }
  function toggle(event: Event) { if ((event.currentTarget as HTMLDetailsElement).open) void operation(load) }
  async function confirm() { if (!preview) return; status = await claudeStatuslineApi.confirm(preview.id); preview = undefined; await onQuotaChange(); message = words('配置已更新。等待 Claude 正常响应，或查看 /usage。', 'Settings updated. Wait for a normal Claude response, or check /usage.') }
</script>
<details id="claude-integration" class="card" on:toggle={toggle}>
  <summary>{words('Claude 本地额度接入', 'Claude local quota connection')}</summary>
  <p>{words('仅在你确认后修改用户级 statusline，备份并保留原命令输出。只采集官方额度窗口、时间及不含原值的会话/响应指纹；不保存提示词、回复、账号或凭据，不上传。项目级设置可能覆盖用户设置。确认时请勿同时在外部编辑设置。', 'Only your confirmation changes the user statusline, with a backup and original output preserved. Collects official quota windows, times and opaque session/response hashes only; no prompts, responses, account identity, credentials or uploads. Project settings may override user settings. Do not edit settings elsewhere while confirming.')}</p>
  <p>{words('显示的是当前会话观测，最长 30 秒有效，并非全局账号已验证。多个活跃会话、切号后清除、缺字段或过期时不显示百分比。首次正常响应后才可能收到官方窗口。', 'Shows a session observation valid for at most 30 seconds, not a verified global account. Multiple active sessions, clearing after an account switch, absent fields or expiration hide percentages. Official windows may arrive after the first normal response.')}</p>
  <p data-testid="claude-terminal-requirement">{words('已启用表示配置已保存，不代表已收到额度。此接入需要交互式终端中的 Claude Code statusline；桌面应用、IDE 后台或 --print 流式会话可能不执行它。无需重复启用；在终端运行 claude，自行完成下一次正常响应后检查。', 'Enabled means settings are saved, not that quota has been received. This connection requires the Claude Code statusline in an interactive terminal; desktop, IDE background and --print sessions may not run it. Do not enable again. Run claude in a terminal and check after your next normal response.')}</p>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if message}<p role="status">{message}</p>{/if}
  {#if status}
    <p>{status.enabled ? words('已启用 · 仅本地', 'Enabled · local only') : status.conflict ? words('外部设置已更改：不覆盖、不自动恢复。请手动调整 Claude statusline。', 'Settings changed externally: overwrite and automatic restoration are blocked. Adjust the Claude statusline manually.') : words('未启用', 'Not enabled')}</p>
    {#if status.enabled && !status.canRestore}<p>{words('设置存在外部修改，自动恢复已阻止；请手动恢复原 statusline，不会覆盖你的修改。', 'External settings edits block automatic restoration. Restore the original statusline manually; your edits will not be overwritten.')}</p>{/if}
    {#if !preview}
      <button data-testid="claude-preview-enable" disabled={busy || status.enabled || status.conflict || status.managedConfigured} on:click={() => operation(async () => { preview = await claudeStatuslineApi.preview('enable') })}>{words('预览启用', 'Preview enable')}</button>
      {#if status.canRestore}<button data-testid="claude-preview-disable" disabled={busy} on:click={() => operation(async () => { preview = await claudeStatuslineApi.preview('disable') })}>{words('预览停用并恢复', 'Preview disable and restore')}</button>{/if}
      {#if status.enabled}<button data-testid="claude-clear" disabled={busy} on:click={() => operation(async () => { await claudeStatuslineApi.clear(); await onQuotaChange(); message = words('观测已清除。若缺少清除边界，请开启新的 Claude Code 会话，或预览停用并恢复、确认，再预览启用并确认；有边界时由进度更新的响应恢复观测。', 'Observation cleared. If the progress boundary is missing, start a new Claude Code session or preview disable and restore, confirm, then preview enable and confirm again. Otherwise, a response with newer progress can restore the observation.') })}>{words('切号后清除观测', 'Clear after switching account')}</button>{/if}
      {#if (status.enabled || status.conflict) && !status.canRestore}<button data-testid="claude-pause" disabled={busy} on:click={() => operation(async () => { status = await claudeStatuslineApi.pause(); await onQuotaChange(); message = words('采集已停止，现有 Claude 设置未更改；可手动恢复备份 original 字段。', 'Capture stopped without changing Claude settings; restore the backup original field manually if needed.') })}>{words('停止采集，保留外部设置', 'Stop capture; keep external settings')}</button>{/if}
    {/if}
  {/if}
  {#if status?.managedConfigured && !status.enabled}<p>{words('采集已停止，组合脚本仍保留原输出。恢复原命令后才能重新启用。备份：~/.aiusage/claude-statusline-installation.json 的 original 字段。', 'Capture is stopped; the wrapper still preserves original output. Restore the original command before enabling again. Backup: the original field in ~/.aiusage/claude-statusline-installation.json.')}</p>{/if}
  {#if preview}
    <div class="preview" role="region" aria-label={words('配置修改预览', 'Settings change preview')}>
      <p>{preview.action === 'enable' ? preview.originalPresent ? words('将保留原 statusline 输出并追加本地捕获。仅备份原 statusLine 字段；停用时检查冲突再恢复。', 'Preserves original statusline output and adds local capture. Backs up only statusLine; checks conflicts before restoring on disable.') : words('将创建本地组合脚本，显示 Claude Code，并捕获官方额度。停用恢复原来未配置的状态。', 'Creates a local wrapper displaying Claude Code and capturing official quota. Disabling restores the previously unconfigured state.') : words('将停止捕获并恢复原 statusLine 字段。外部修改会阻止自动恢复。', 'Stops capture and restores the original statusLine. External edits block automatic restoration.')}</p>
      <button data-testid="claude-confirm" disabled={busy} on:click={() => operation(confirm)}>{preview.action === 'enable' ? words('确认启用', 'Confirm enable') : words('确认停用并恢复', 'Confirm disable and restore')}</button>
      <button data-testid="claude-cancel" disabled={busy} on:click={() => preview = undefined}>{words('取消，不改设置', 'Cancel without changes')}</button>
    </div>
  {/if}
  <p>{words('无法显示时：在 Claude Code 输入 /usage，或查看 ', 'If unavailable: enter /usage in Claude Code, or open ')}<a href="https://claude.ai/settings/usage" target="_blank" rel="noreferrer">{words('Claude 官方用量页', 'official Claude usage')}</a>。</p>
</details>
<style>details { margin-top:16px; } summary { cursor:pointer; font-weight:600; } p { font-size:12px; line-height:1.7; color:var(--text-secondary); } button { margin:4px 8px 4px 0; } .preview { padding:12px; border:1px solid var(--border-color); border-radius:8px; }</style>
