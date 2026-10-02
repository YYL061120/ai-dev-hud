import { afterEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

function browser(stored: string | null, language = 'en-US', blocked = false) {
  const storage = new Map(stored === null ? [] : [['aiusage-lang', stored]])
  vi.stubGlobal('window', {
    navigator: { language },
    localStorage: {
      getItem: (key: string) => { if (blocked) throw new Error('Storage unavailable'); return storage.get(key) ?? null },
      setItem: (key: string, value: string) => { if (blocked) throw new Error('Storage unavailable'); storage.set(key, value) },
    },
  })
  vi.stubGlobal('document', { documentElement: { lang: '' } })
  return storage
}

describe('dashboard languages', () => {
  it('keeps Chinese and English translation coverage aligned', async () => {
    const { translations } = await import('../src/lib/i18n.js')
    function keys(value: object, prefix = ''): string[] {
      return Object.entries(value).flatMap(([key, v]) => typeof v === 'string' ? [prefix + key] : keys(v, prefix + key + '.'))
    }
    expect(keys(translations.zh).sort()).toEqual(keys(translations.en).sort())
    expect(translations.zh.nav.overview).toBe('概览')
    expect(translations.zh.common.live).toBe('实时')
  })

  it('honors an explicit saved choice across a new store initialization', async () => {
    const storage = browser('en', 'zh-CN')
    let i18n = await import('../src/lib/i18n.js')
    expect(get(i18n.lang)).toBe('en')
    i18n.setLang('zh')
    expect(storage.get('aiusage-lang')).toBe('zh')
    expect(document.documentElement.lang).toBe('zh-CN')
    vi.resetModules()
    i18n = await import('../src/lib/i18n.js')
    expect(get(i18n.lang)).toBe('zh')
    i18n.toggleLang()
    expect(storage.get('aiusage-lang')).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('uses browser preference when saved storage is invalid', async () => {
    browser('corrupt', 'zh-TW')
    const { lang, t, setLang } = await import('../src/lib/i18n.js')
    expect(get(lang)).toBe('zh')
    setLang('invalid')
    expect(get(lang)).toBe('zh')
    expect(get(t)('nav.settings')).toBe('设置')
  })

  it('still switches languages when browser storage is blocked', async () => {
    browser(null, 'en-US', true)
    const { lang, setLang, t } = await import('../src/lib/i18n.js')
    expect(() => setLang('zh')).not.toThrow()
    expect(get(lang)).toBe('zh')
    expect(get(t)('auth.password')).toBe('密码')
  })

  it('renders known English fallback and preserves unknown identifiers', async () => {
    const { translate } = await import('../src/lib/i18n.js')
    expect(translate('invalid', 'nav.overview')).toBe('Overview')
    expect(translate('zh', 'gpt-4o')).toBe('gpt-4o')
  })

  it('formats date-only buckets as local dates and numeric totals without changing values', async () => {
    const { formatDate, formatDateTime, formatNumber, formatTokens } = await import('../src/lib/stores.js')
    const local = new Date(2026, 9, 2)
    expect(formatDate('2026-10-02', 'zh')).toBe(local.toLocaleDateString('zh-CN'))
    expect(formatDate('2026-10-02', 'en')).toBe(local.toLocaleDateString('en-US'))
    const instant = '2026-10-02T12:34:56Z'
    expect(formatDateTime(instant, 'zh')).toBe(new Date(instant).toLocaleString('zh-CN'))
    for (const language of ['en', 'zh']) expect(Number(formatNumber(1234567, language).replaceAll(',', ''))).toBe(1234567)
    expect(formatTokens(12500)).toBe('12.5K')
  })

  it('keeps currency and cost precision independent of UI language', async () => {
    const { setLang } = await import('../src/lib/i18n.js')
    const { displayCurrency, exchangeRate, formatCost } = await import('../src/lib/stores.js')
    exchangeRate.set(0.125)
    for (const language of ['en', 'zh']) {
      setLang(language)
      displayCurrency.set('USD'); expect(formatCost(0.001)).toBe('$0.0010'); expect(formatCost(1.25)).toBe('$1.25')
      displayCurrency.set('CNY'); expect(formatCost(1.25)).toBe('¥10.00')
    }
  })
})
