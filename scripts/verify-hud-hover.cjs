// Continuous pointer regression against the production renderer. Synthetic usage only.
const { chromium } = require(process.env.AI_DEV_HUD_PLAYWRIGHT_PATH || 'playwright')
const { readFileSync, writeFileSync, mkdirSync, mkdtempSync } = require('node:fs')
const { pathToFileURL } = require('node:url')
const path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const evidence = process.env.AI_DEV_HUD_HOVER_EVIDENCE_DIR || mkdtempSync(path.join(os.tmpdir(), 'hud-hover-'))
mkdirSync(evidence, { recursive: true })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let browser, server
async function run() {
  const domain = await import(pathToFileURL(path.join(root, 'packages/core/dist/index.js')).href)
  const now = new Date(), current = 'a'.repeat(64)
  const rows = [0, 1, 2, 3].map(i => ({ deviceKey: String.fromCharCode(97 + i).repeat(64), recordKey: String(i + 1).padStart(64, '0'), projectKey: null, sessionKey: null, ts: +now, updatedAt: +now, tool: 'codex', model: `synthetic-model-${i}`, provider: 'openai', platform: i % 2 ? 'darwin' : 'win32', inputTokens: (i + 1) * 1200, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0, cost: 0, costSource: 'unknown' }))
  const rings = Object.fromEntries(['today', 'seven', 'thirty', 'lifetime'].map(period => [period, domain.buildUsageRings(rows, current, period, new Map(), undefined, undefined, now)]))
  const renderer = path.join(root, 'packages/widget/dist/renderer')
  server = http.createServer((req, res) => {
    const file = path.resolve(renderer, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.slice(1)))
    if (!file.startsWith(renderer + path.sep)) { res.writeHead(403).end(); return }
    try { res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(readFileSync(file)) } catch { res.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  browser = await chromium.launch({ executablePath: process.env.AI_DEV_HUD_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true })
  const errors = [], checks = []
  for (const scale of [1, 1.5]) for (const reduced of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 376, height: 536 }, deviceScaleFactor: scale, reducedMotion: reduced ? 'reduce' : 'no-preference', recordVideo: { dir: evidence, size: { width: 376, height: 536 } } })
    await context.addInitScript(({ rings }) => {
      const usage = { tokens: rings.today.total.tokens, sessions: 4, usageRecords: 4, cost: 0 }
      const data = { status: 'ready', today: usage, week: usage, models: [], updatedAt: Date.now(), rings }
      let state = { expanded: false, displayId: 0, reveal: 1, hoverEnabled: true }, listener
      window.regionReports = []; window.pointerClicks = 0; window.dashboardCalls = 0
      document.addEventListener('click', () => window.pointerClicks++)
      window.publishHud = value => { state = { ...state, ...value }; listener?.(state) }
      window.hud = { enabled: true, refresh: async () => data, getData: async () => data, getState: async () => state, setExpanded: async expanded => { window.publishHud({ expanded }); return state }, setRegions: (regions, reduced) => window.regionReports.push({ regions, reduced }), openDashboard: async () => window.dashboardCalls++, onDataUpdate: () => () => {}, onStateUpdate: fn => { listener = fn; return () => {} } }
    }, { rings })
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.goto(`http://127.0.0.1:${server.address().port}`)
    const units = page.locator('.rail [data-testid="usage-ring"]'), detail = page.locator('.rail [data-testid="ring-detail"]')
    await units.first().waitFor(); await pause(100)
    const railBefore = await page.locator('.rail').boundingBox()
    const first = await units.first().boundingBox()
    await page.mouse.move(first.x + first.width / 2, first.y + 20)
    await detail.waitFor(); await pause(180)
    assert.equal(await page.evaluate(() => window.pointerClicks), 0, 'Hover must open without a click')
    await detail.evaluate(e => window.originalShell = e)
    const card = await detail.boundingBox()
    // Cross the real 12 DIP gap, linger there, then enter the card and its model row.
    await page.mouse.move(card.x + card.width + 6, first.y + 20, { steps: 8 }); await pause(500)
    assert.equal(await detail.count(), 1, 'Slow gap crossing must preserve the card')
    await page.mouse.move(card.x + card.width / 2, card.y + 40, { steps: 12 }); await pause(250)
    await page.mouse.move(card.x + 60, card.y + card.height - 30, { steps: 12 }); await pause(250)
    assert.equal(await detail.count(), 1)
    const second = await units.nth(1).boundingBox()
    await page.mouse.move(second.x + second.width / 2, second.y + 20, { steps: 16 })
    const frames = []
    for (let i = 0; i < 9; i++) {
      frames.push(await detail.evaluate(e => { const b = e.getBoundingClientRect(); return { time: performance.now(), x: b.x, y: b.y, height: b.height, sameShell: e === window.originalShell, content: Array.from(e.querySelectorAll('.detail-body')).map(n => ({ opacity: getComputedStyle(n).opacity, text: n.querySelector('h3').textContent })) } }))
      if (!reduced && scale === 1) await page.screenshot({ path: path.join(evidence, `hover-switch-${i}.png`) })
      await pause(20)
    }
    assert(frames.every(f => f.sameShell), 'Switch must retain the shell DOM node')
    if (!reduced) assert(frames.some(f => f.content.length === 2), 'Actual old/new content must overlap during crossfade')
    // 60ms interruption must keep exactly two bounded layers, with no outro accumulation.
    await page.evaluate(() => {
      window.rapidFrames = []
      window.rapidSampler = setInterval(() => {
        const shell = document.querySelector('.rail [data-testid="ring-detail"]')
        const content = Array.from(shell?.querySelectorAll('.detail-body') ?? []).map(e => ({ key: e.dataset.contentKey, opacity: Number(getComputedStyle(e).opacity) }))
        window.rapidFrames.push({ time: performance.now(), sameShell: shell === window.originalShell, content })
      }, 16)
    })
    for (let i = 0; i < 16; i++) {
      const b = await units.nth(i % 2).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + 20); await pause(60)
      assert.equal(await detail.evaluate(e => e === window.originalShell), true)
    }
    // Re-enter the same circle without replacing either live layer or restarting progress.
    const same = await units.nth(1).boundingBox()
    await page.mouse.move(same.x + same.width / 2 + 1, same.y + 20); await pause(60)
    // Interrupt with a third actual device; still at most two layers.
    await page.keyboard.press('Tab'); await units.nth(2).focus(); await pause(60)
    await units.nth(3).focus(); await pause(60)
    await pause(180)
    const rapidFrames = await page.evaluate(() => { clearInterval(window.rapidSampler); return window.rapidFrames })
    assert(rapidFrames.length > 30)
    assert(rapidFrames.every(f => f.sameShell && f.content.length <= (reduced ? 1 : 2)), 'Interrupted transitions must not accumulate outro layers')
    assert(rapidFrames.every(f => Math.abs(f.content.reduce((sum, layer) => sum + layer.opacity, 0) - 1) < .002), 'Content weights must retain brightness')
    assert.equal(await page.evaluate(() => CSS.supports('mix-blend-mode', 'plus-lighter')), true)
    if (!reduced && scale === 1) await page.screenshot({ path: path.join(evidence, 'hover-bounded-settled.png') })
    await page.mouse.move(20, 500); await pause(100); assert.equal(await detail.count(), 1)
    await page.mouse.move(first.x + first.width / 2, first.y + 20); await pause(200); assert.equal(await detail.count(), 1, 'Return must cancel pending close')
    await page.mouse.move(20, 500); await detail.waitFor({ state: 'detached', timeout: 800 }); assert.equal(await detail.count(), 0)
    await page.keyboard.press('Tab'); await units.first().focus(); await detail.waitFor(); await page.keyboard.press('Escape'); await detail.waitFor({ state: 'detached', timeout: 800 }); assert.equal(await detail.count(), 0)
    await units.last().focus(); await detail.waitFor(); await pause(280)
    const lastUnit = await units.last().boundingBox(), dock = await page.locator('.rail .ring-dock').boundingBox(), lastCard = await detail.boundingBox()
    assert(lastUnit.y >= dock.y - 1 && lastUnit.y + lastUnit.height <= dock.y + dock.height + 1, 'Keyboard must reach compact dock devices')
    assert(lastCard.x >= 0 && lastCard.y >= 0 && lastCard.x + lastCard.width <= 376 && lastCard.y + lastCard.height <= 536)
    await page.keyboard.press('Escape'); await detail.waitFor({ state: 'detached', timeout: 800 })
    await page.getByTestId('hud-toggle').click(); await pause(340)
    const railExpanded = await page.locator('.rail').boundingBox(); assert.deepEqual(railExpanded, railBefore, 'Rail position/size must not change on expansion')
    await page.getByTestId('open-dashboard').click(); assert.equal(await page.evaluate(() => window.dashboardCalls), 1)
    await page.getByTestId('hud-toggle').click(); await pause(340)
    assert.deepEqual(await page.locator('.rail').boundingBox(), railBefore)
    // Exercise the actual renderer during a continuous reveal/reversal sequence.
    const revealFrames = []
    for (const reveal of [1,.8,.6,.4,.2,.35,.5,.7,.9,1]) { await page.evaluate(reveal => window.publishHud({ reveal }), reveal); await pause(25); revealFrames.push({ reveal, rail: await page.locator('.rail').boundingBox() }) }
    assert(revealFrames.every(f => Math.abs(f.rail.y - railBefore.y) < .01))
    const regions = await page.evaluate(() => window.regionReports.at(-1))
    assert.equal(regions.reduced, reduced)
    checks.push({ scale, reduced, hoverWithoutClick: true, gapHeld: true, persistentShell: true, bounded60ms: true, rapidFrames, frames, railBefore, railExpanded, revealFrames, keyboardEscape: true, dashboard: true })
    const video = page.video(); await context.close(); await video.saveAs(path.join(evidence, `hover-path-${scale}-${reduced ? 'reduced' : 'motion'}.webm`))
  }
  assert.deepEqual(errors, [])
  writeFileSync(path.join(evidence, 'hover-continuity.json'), JSON.stringify({ productionComponents: true, synthetic: true, browserPointer: true, nativeDesktopPointer: false, checks, errors }, null, 2))
  console.log(JSON.stringify({ checks: checks.length, errors, evidence }))
}
run().catch(e => { console.error(e); process.exitCode = 1 }).finally(async () => { await browser?.close(); server?.close() })
