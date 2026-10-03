// Production Svelte/Chromium layout regression. Run after pnpm.cmd build.
// Uses isolated, empty CLI data and synthetic typed API inputs; never reads user logs.
const { chromium } = require(process.env.AI_DEV_HUD_PLAYWRIGHT_PATH || 'playwright')
const { readFileSync, writeFileSync, mkdirSync, mkdtempSync } = require('node:fs')
const { spawn } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const { createHash } = require('node:crypto')
const http = require('node:http'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const evidence = process.env.AI_DEV_HUD_LAYOUT_EVIDENCE_DIR || mkdtempSync(path.join(os.tmpdir(), 'ai-dev-hud-ring-layout-'))
mkdirSync(evidence, { recursive: true })
const profile = mkdtempSync(path.join(evidence, 'layout-fixture-'))
for (const directory of ['AppData/Roaming', 'AppData/Local', '.aiusage', 'empty']) mkdirSync(path.join(profile, directory), { recursive: true })
writeFileSync(path.join(profile, '.aiusage/config.json'), JSON.stringify({ exchangeRate: 0.14, displayCurrency: 'USD' }))
const env = { ...process.env, USERPROFILE: profile, APPDATA: path.join(profile, 'AppData/Roaming'), LOCALAPPDATA: path.join(profile, 'AppData/Local'), CODEX_HOME: path.join(profile, 'empty'), AIUSAGE_CODEX_PATH: path.join(profile, 'empty'), AIUSAGE_CLAUDE_CODE_PATH: path.join(profile, 'empty') }
delete env.AIUSAGE_DASHBOARD_PASSWORD
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(probe) { const end = Date.now() + 15000; while (Date.now() < end) { if (await probe()) return; await pause(40) } throw new Error('Layout regression condition timed out') }
async function port() { const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value }
let cli, browser, assets
const errors = [], checks = []
function observe(page) { page.on('pageerror', error => errors.push(error.message)) }
async function geometry(page, selector) {
  return page.locator(selector).evaluate(element => {
    const r = element.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
  })
}
async function keyboardDetail(page, button) {
  await page.mouse.move(0, 0)
  await page.keyboard.press('Tab')
  await button.focus()
  await page.getByTestId('ring-detail').waitFor()
  await pause(200)
}
function hudInput({ rings, count }) {
  const usage = { tokens: rings.today.total.tokens, sessions: count, usageRecords: count, cost: 0 }
  const data = { status: 'ready', today: usage, week: usage, models: [], updatedAt: Date.now(), rings }
  let state = { expanded: true, displayId: 0, reveal: 1, hoverEnabled: true }
  window.dashboardCalls = 0
  window.hud = {
    enabled: true, getData: async () => data, refresh: async () => data, getState: async () => state,
    setExpanded: async expanded => state = { ...state, expanded },
    openDashboard: async () => { window.dashboardCalls++ },
    onDataUpdate: () => () => {}, onStateUpdate: () => () => {},
  }
}
async function run() {
  try {
    const domain = await import(pathToFileURL(path.join(root, 'packages/core/dist/index.js')).href)
    const deviceKey = index => createHash('sha256').update(`layout-fixture-device-${index}`).digest('hex')
    const current = deviceKey(0), now = new Date(), timestamp = now.getTime()
    function sample(count) {
      const rows = Array.from({ length: count }, (_, index) => ({
        deviceKey: deviceKey(index), recordKey: String(index + 100).padStart(64, '0'), projectKey: null, sessionKey: null,
        ts: timestamp, updatedAt: timestamp, tool: 'codex', model: `gpt-4o-fixture-${index}`, provider: 'openai', platform: index % 2 ? 'darwin' : 'win32',
        inputTokens: (index + 1) * 100, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0, cost: 0, costSource: 'unknown',
      }))
      const rings = Object.fromEntries(['today', 'seven', 'thirty', 'lifetime'].map(period => [period, domain.buildUsageRings(rows, current, period, new Map(), undefined, undefined, now)]))
      return { rings, overview: { ...domain.aggregateUsage(rows, current, 'thirty', undefined, undefined, now), rings: rings.thirty } }
    }
    const cliPort = await port(), base = `http://127.0.0.1:${cliPort}`
    cli = spawn(process.execPath, [path.join(root, 'packages/cli/dist/index.js'), 'serve', '--port', String(cliPort)], { cwd: root, env, windowsHide: true, stdio: 'ignore' })
    await until(async () => { try { return (await fetch(base + '/api/auth/status')).ok } catch { return false } })
    const renderer = path.join(root, 'packages/widget/dist/renderer')
    assets = http.createServer((request, response) => {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname
      const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1))
      const file = path.resolve(renderer, relative)
      if (!file.startsWith(renderer + path.sep)) { response.writeHead(403); response.end(); return }
      try { response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); response.end(readFileSync(file)) }
      catch { response.writeHead(404); response.end() }
    })
    await new Promise(resolve => assets.listen(0, '127.0.0.1', resolve))
    const widget = `http://127.0.0.1:${assets.address().port}`
    browser = await chromium.launch({ ...(process.env.AI_DEV_HUD_BROWSER_PATH ? { executablePath: process.env.AI_DEV_HUD_BROWSER_PATH } : process.platform === 'win32' ? { executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' } : {}), headless: true })
    for (const scale of [1, 1.5]) {
      const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 900 }, deviceScaleFactor: scale })
      const page = await context.newPage(); observe(page)
      const input = sample(4)
      await page.route('**/api/local/usage?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(input.overview) }))
      await page.goto(base + '/local-usage'); await page.getByTestId('usage-ring').last().waitFor()
      const button = page.getByTestId('usage-ring').last()
      await keyboardDetail(page, button)
      const active = await button.getAttribute('data-key')
      for (const width of [420, 320, 280, 1280]) {
        await page.setViewportSize({ width, height: 900 }); await pause(220)
        assert.equal(await page.getByTestId('ring-detail').count(), 1)
        assert.equal(await button.evaluate(element => element === document.activeElement), true, 'Resize must keep keyboard focus')
        assert.equal(await button.getAttribute('data-key'), active)
        const card = await geometry(page, '[data-testid="ring-detail"]')
        assert(card.x >= -1 && card.right <= width + 1, JSON.stringify({ scale, width, card }))
        checks.push({ type: 'page-resize', scale, width, card, sameActiveKey: true, focusRetained: true })
        if (width !== 1280) { await page.getByTestId('ring-detail').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(evidence, `rings-layout-page-${width}-${scale}.png`) }) }
      }
      await context.close()
      for (const count of [3, 4, 8, 12]) {
        const hudContext = await browser.newContext({ locale: 'zh-CN', viewport: { width: 376, height: 536 }, deviceScaleFactor: scale })
        await hudContext.addInitScript(hudInput, { rings: sample(count).rings, count })
        const hud = await hudContext.newPage(); observe(hud); await hud.goto(widget)
        await hud.getByTestId('hud-summary').waitFor()
        const group = hud.locator('.summary'), units = group.getByTestId('usage-ring')
        assert.equal(await units.count(), count + 1)
        for (let index = 0; index <= count; index++) {
          await keyboardDetail(hud, units.nth(index))
          const dock = await geometry(hud, '.summary .ring-dock'), unit = await units.nth(index).boundingBox()
          assert(unit.y >= dock.y - 1 && unit.y + unit.height <= dock.bottom + 1, 'Every device must be reachable by keyboard within the scrolling dock')
          assert.equal(await hud.getByTestId('ring-detail').count(), 1)
          assert.equal(await units.nth(index).evaluate(element => element === document.activeElement), true)
          const card = await geometry(hud, '.summary [data-testid="ring-detail"]'), dashboard = await geometry(hud, '[data-testid="open-dashboard"]')
          assert(card.bottom <= dashboard.y && card.right <= 376 && card.x >= 0, JSON.stringify({ count, scale, index, card, dashboard }))
          assert(dashboard.bottom <= 536 && dashboard.y >= 0, 'Dashboard button must fit inside the viewport')
          assert.equal(await hud.getByTestId('open-dashboard').evaluate(element => {
            const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
            return hit?.closest('[data-testid="open-dashboard"]') === element
          }), true, 'Detail must not intercept Dashboard clicks')
        }
        const dashboard = await geometry(hud, '[data-testid="open-dashboard"]'), card = await geometry(hud, '.summary [data-testid="ring-detail"]')
        await hud.screenshot({ path: path.join(evidence, `rings-layout-hud-${count}-${scale}.png`) })
        await hud.getByTestId('open-dashboard').click(); assert.equal(await hud.evaluate(() => window.dashboardCalls), 1)
        checks.push({ type: 'hud-devices', scale, count, accessibleRings: count + 1, singleDetail: true, focusRetained: true, card, dashboard, dashboardHitAndCallback: true })
        await hudContext.close()
      }
    }
    assert.deepEqual(errors, [])
    const result = { at: new Date().toISOString(), productionComponents: true, synthetic: true, checks, pageErrors: errors }
    writeFileSync(path.join(evidence, 'rings-layout-regression.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result))
  } finally {
    await browser?.close()
    if (assets) await new Promise(resolve => assets.close(resolve))
    if (cli) cli.kill()
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
