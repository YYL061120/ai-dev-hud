<script>
  import { lang, setLang } from '$lib/i18n.js'
</script>

<div class="language-switch" data-testid="dashboard-language" role="group" aria-label="语言 / Language">
  <button type="button" lang="zh-CN" aria-pressed={$lang === 'zh'} on:click={() => setLang('zh')}>中文</button>
  <button type="button" lang="en" aria-pressed={$lang === 'en'} on:click={() => setLang('en')}>English</button>
</div>

<style>
  .language-switch { display: inline-flex; gap: 0.25rem; padding: 0.25rem; border: 1px solid var(--border-subtle); border-radius: 0.625rem; background: var(--surface); }
  button { min-height: 2rem; padding: 0.35rem 0.75rem; border: 0; border-radius: 0.4rem; background: transparent; color: var(--text-secondary); font: inherit; font-size: 0.8125rem; cursor: pointer; }
  button[aria-pressed="true"] { background: var(--accent); color: white; }
  button:hover { color: var(--text); }
  button[aria-pressed="true"]:hover { color: white; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
