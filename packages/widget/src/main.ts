import { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, dialog, screen, nativeTheme } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { EXCHANGE_RATE_SOURCE } from './currency'
import type { ExchangeRateState } from './currency'
import { queryWidgetData } from './data'
import { queryHudData, unavailableHudData } from './hud-data'
import { getHudCanvasBounds, getHudRailBounds, getHudDisplayId } from './hud-window'
import type { HudState, HudArea } from './hud-window'
import { HudHoverController } from './hud-hover'
import { isDashboardReachable, probeDashboard, refreshDashboard, fetchUsageRings } from './dashboard-client'
import { t } from './i18n'
import { loadSettings, saveSettings } from './settings'
import type { WidgetSettings } from './settings'
import {
  getTrayIconNativeImage,
  getWidgetNativeBindingPath,
  getWindowPosition,
  hasUsableTrayBounds,
  shouldHideWindowOnBlur,
  shouldHideWindowOnClose,
  shouldShowWindowOnLaunch,
} from './ui'

const nodeRequire = createRequire(__filename)
const Database = nodeRequire('better-sqlite3') as typeof import('better-sqlite3')

const DB_PATH = join(homedir(), '.aiusage', 'cache.db')
const PORT_FILE = join(homedir(), '.aiusage', '.serve-port')
const FX_CACHE_FILE = join(homedir(), '.aiusage', 'widget-exchange-rate.json')
const DASHBOARD_PORT = 3847
const WINDOW_WIDTH = 380
const DEFAULT_WINDOW_HEIGHT = 500
const MIN_WINDOW_HEIGHT = 320
const FX_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const HUD_MODE = process.platform === 'win32' && process.argv.includes('--hud')
const LOCAL_CLI_ENTRY = join(__dirname, '..', '..', 'cli', 'dist', 'index.js')
let hudState: HudState = { expanded: false, displayId: 0, reveal: 0, hoverEnabled: true }
const hudHover = new HudHoverController()
let hudPollTimer: ReturnType<typeof setTimeout> | null = null
let hudPositionTimers: ReturnType<typeof setTimeout>[] = []
let hudMouseIgnored = true
let hudRegions: HudArea[] = []
let hudReduced = false
let hudShapeKey = ''
let hudRefreshPromise: Promise<ReturnType<typeof getHudData>> | null = null
let dashboardLaunchPromise: Promise<{ success: boolean; error?: string }> | null = null
let hudAuthenticationPort: number | null = null
let hudRings: Awaited<ReturnType<typeof fetchUsageRings>> | undefined
let hudRingsError: string | undefined
const HUD_AUTH_MESSAGE = 'Dashboard 需要登录。HUD 自动解析已暂停；请打开仪表盘使用现有登录页。'

let tray: Tray | null = null
let win: BrowserWindow | null = null
let db: InstanceType<typeof Database> | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null
let quotaRefreshTimer: ReturnType<typeof setInterval> | null = null
let positionRetryTimers: Array<ReturnType<typeof setTimeout>> = []
let settings: WidgetSettings = loadSettings()
let exchangeRate: ExchangeRateState = loadExchangeRateCache()
let exchangeRatePromise: Promise<ExchangeRateState> | null = null

app.setName(HUD_MODE ? 'AI Dev HUD' : 'AIUsage Widget')

// Prevent dock icon on macOS
if (process.platform === 'darwin' && app.dock) {
  app.dock.hide()
}

app.whenReady().then(async () => {
  const dbExists = existsSync(DB_PATH)

  if (dbExists) {
    try {
      db = new Database(DB_PATH, {
        readonly: true,
        nativeBinding: getWidgetNativeBindingPath(__dirname),
      })
    } catch (error) {
      if (!HUD_MODE) throw error
      console.error('AI Dev HUD: local database unavailable')
    }
  }

  applyTheme(settings.theme)
  if (HUD_MODE) {
    hudState.displayId = getHudDisplayId(screen.getAllDisplays(), settings.hudDisplayId, screen.getPrimaryDisplay().id)
    screen.on('display-added', () => positionHud(true))
    screen.on('display-removed', () => positionHud(true))
    screen.on('display-metrics-changed', () => positionHud(true))
  }
  createTray()
  createWindow()
  startAutoRefresh()
  if (!HUD_MODE) void refreshExchangeRate()

  if (HUD_MODE) {
    positionHud(true)
    startHudPointerWatch()
    // Existing AIUsage CLI owns ingestion. The renderer never reads logs.
    await refreshHudData()
    return
  }

  if (!dbExists) {
    await autoSetup()
  } else if (shouldShowWindowOnLaunch(app.isPackaged)) {
    showWindowWhenTrayReady()
  }
})

app.on('window-all-closed', () => {
  // Keep the app running in the tray — do not quit
})

app.on('before-quit', () => {
  if (hudPollTimer) clearTimeout(hudPollTimer)
  for (const timer of hudPositionTimers) clearTimeout(timer)
  db?.close()
})

function applyTheme(theme: WidgetSettings['theme']): void {
  nativeTheme.themeSource = theme
}

function updateTrayToolTip(): void {
  if (!HUD_MODE) { tray?.setToolTip('AIUsage Widget'); return }
  const displays = screen.getAllDisplays()
  const index = displays.findIndex(display => display.id === hudState.displayId)
  const display = displays[index]
  const status = hudHover.enabled ? '已启用' : '已暂停'
  tray?.setToolTip(`AI Dev HUD · 边缘唤起${status} · 显示器 ${index + 1} ${display?.label ?? ''}`.slice(0, 127))
}

function createTray(): void {
  const { buffer, scaleFactor } = getTrayIconNativeImage()
  const icon = nativeImage.createFromBuffer(buffer, scaleFactor ? { scaleFactor } : undefined)
  tray = new Tray(icon)
  updateTrayToolTip()

  tray.on('click', () => toggleWindow())
  tray.on('right-click', () => {
    const i18n = t(settings.locale)
    const menu = Menu.buildFromTemplate([
      { label: HUD_MODE ? `启用边缘唤起（${hudHover.enabled ? '已启用' : '已暂停'}）` : i18n.showPanel, click: () => showWindow() },
      { label: i18n.openDashboard, click: () => openDashboardAction() },
      { label: i18n.refresh, click: () => { if (HUD_MODE) void refreshHudData(true); else pushDataUpdate() } },
      ...(HUD_MODE ? [{ label: '显示器', submenu: screen.getAllDisplays().map((display, index) => ({
        label: `${index + 1} · ${display.label || `${display.size.width} × ${display.size.height}`}`,
        type: 'radio' as const,
        checked: display.id === hudState.displayId,
        click: () => { settings = { ...settings, hudDisplayId: display.id }; saveSettings(settings); hudState.displayId = display.id; positionHud(true); showWindow() },
      })) }] : []),
      { type: 'separator' },
      { label: i18n.quit, click: () => { app.exit(0) } },
    ])
    tray!.popUpContextMenu(menu)
  })
}

function createWindow(): void {
  win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    ...(HUD_MODE ? { title: 'AI Dev HUD', backgroundColor: '#00000000', hasShadow: false } : {}),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: HUD_MODE ? ['--ai-dev-hud'] : [],
    },
  })

  const rendererPath = join(__dirname, 'renderer', 'index.html')
  win.loadFile(rendererPath)
  if (HUD_MODE) win.setIgnoreMouseEvents(true)

  if (!HUD_MODE && shouldHideWindowOnBlur(app.isPackaged)) {
    win.on('blur', () => win?.hide())
  }
}

function showWindow(): void {
  if (!win) return

  if (HUD_MODE) {
    hudHover.setEnabled(true)
    hudState.hoverEnabled = true
    updateTrayToolTip()
    win.webContents.send('hud:state-update', hudState)
    pushDataUpdate()
    return
  }
  positionWindowNearTray()
  win.show()
  win.focus()
  pushDataUpdate()
  if (!HUD_MODE) schedulePositionRetries()
}

function positionHud(resetReveal = false): void {
  if (!win) return
  const display = screen.getAllDisplays().find(display => display.id === settings.hudDisplayId)
    ?? screen.getAllDisplays().find(display => display.id === hudState.displayId)
    ?? screen.getPrimaryDisplay()
  hudState.displayId = display.id
  // Temporary unplug fallback must not overwrite the remembered monitor.
  if (settings.hudDisplayId === undefined) {
    settings = { ...settings, hudDisplayId: display.id }
    saveSettings(settings)
  }
  updateTrayToolTip()
  if (resetReveal) {
    hudHover.reset()
    hudState.reveal = 0
    win.setIgnoreMouseEvents(true)
    hudMouseIgnored = true
    win.hide()
  }
  const bounds = getHudCanvasBounds(display.workArea)
  win.setBounds(bounds, false)
  // Windows can asynchronously resize the HWND after a cross-DPI move.
  // Reapply only mismatched bounds, without revealing or focusing the HUD.
  for (const timer of hudPositionTimers) clearTimeout(timer)
  hudPositionTimers = [80, 200, 500].map(delay => setTimeout(() => {
    if (!win || win.isDestroyed()) return
    const actual = win.getBounds()
    if (actual.x !== bounds.x || actual.y !== bounds.y || actual.width !== bounds.width || actual.height !== bounds.height) {
      win.setBounds(bounds, false)
    }
  }, delay))
  win.webContents.send('hud:state-update', hudState)
}

function startHudPointerWatch(): void {
  if (hudPollTimer) clearTimeout(hudPollTimer)
  const tick = () => {
    if (!win || win.isDestroyed()) return
    const display = screen.getAllDisplays().find(display => display.id === hudState.displayId)
      ?? screen.getPrimaryDisplay()
    const canvas = win.getBounds()
    const regions = hudRegions.map(region => ({ ...region, x: canvas.x + region.x, y: canvas.y + region.y }))
    const pointer = screen.getCursorScreenPoint()
    const rail = getHudRailBounds(canvas)
    const bridgeHeld = regions.some(region => region.width > 100 && region.width < canvas.width - 56 + 1
      && pointer.x >= region.x + region.width && pointer.x < rail.x
      && pointer.y >= region.y && pointer.y < region.y + region.height)
    const bridgeChanged = hudState.detailBridgeHeld !== bridgeHeld
    hudState.detailBridgeHeld = bridgeHeld
    const frame = hudHover.step(performance.now(), pointer, rail, display.workArea, regions, hudReduced)
    const ignoreMouse = !frame.interactive
    if (hudMouseIgnored !== ignoreMouse) {
      hudMouseIgnored = ignoreMouse
      win.setIgnoreMouseEvents(hudMouseIgnored)
    }
    if (bridgeChanged || Math.abs(hudState.reveal - frame.reveal) > 0.00001) {
      hudState.reveal = frame.reveal
      win.webContents.send('hud:state-update', hudState)
    }
    if (frame.visible && !win.isVisible()) win.showInactive()
    else if (!frame.visible && win.isVisible()) win.hide()
    // Keep idle monitoring inexpensive; animate at the display frame cadence.
    hudPollTimer = setTimeout(tick, frame.visible ? 16 : 40)
  }
  tick()
}

function getHudData() {
  if (HUD_MODE && hudAuthenticationPort === getDashboardPort()) return unavailableHudData(HUD_AUTH_MESSAGE)
  try {
    if (!db && existsSync(DB_PATH)) {
      db = new Database(DB_PATH, { readonly: true, nativeBinding: getWidgetNativeBindingPath(__dirname) })
    }
    if (db) return { ...queryHudData(db), rings: hudRings, ringsError: hudRingsError }
    return db ? queryHudData(db) : unavailableHudData('等待 AIUsage 解析本机用量…')
  } catch {
    return unavailableHudData('暂时无法读取本地用量，请确认 AIUsage 已完成解析。')
  }
}

function showWindowWhenTrayReady(attempt = 0): void {
  if (!tray) return

  const trayBounds = tray.getBounds()
  if (hasUsableTrayBounds({
    platform: process.platform,
    trayBounds,
    displayBounds: screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y }).workArea,
  }) || attempt >= 12) {
    showWindow()
    return
  }

  setTimeout(() => showWindowWhenTrayReady(attempt + 1), 80)
}

function positionWindowNearTray(): boolean {
  if (!win || !tray) return false

  const trayBounds = tray!.getBounds()
  const displayBounds = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y }).workArea
  const winBounds = win.getBounds()
  const { x, y } = getWindowPosition({
    platform: process.platform,
    trayBounds,
    windowBounds: winBounds,
    displayBounds,
  })

  win.setPosition(x, y, false)
  return hasUsableTrayBounds({ platform: process.platform, trayBounds, displayBounds })
}

function schedulePositionRetries(): void {
  for (const timer of positionRetryTimers) clearTimeout(timer)
  positionRetryTimers = [80, 200, 500, 1000].map((delay) => setTimeout(() => {
    if (!win?.isVisible()) return
    const positionedWithRealTrayBounds = positionWindowNearTray()
    if (positionedWithRealTrayBounds) {
      for (const timer of positionRetryTimers) clearTimeout(timer)
      positionRetryTimers = []
    }
  }, delay))
}

function toggleWindow(): void {
  if (HUD_MODE) {
    hudHover.setEnabled(!hudHover.enabled)
    hudState.hoverEnabled = hudHover.enabled
    updateTrayToolTip()
    win?.webContents.send('hud:state-update', hudState)
    return
  }
  if (win?.isVisible()) {
    win.hide()
  } else {
    showWindow()
  }
}

function pushDataUpdate(): void {
  if (HUD_MODE) {
    win?.webContents.send('hud:data-update', getHudData())
    return
  }
  if (!win || !db) return
  try {
    const data = queryWidgetData(db, settings.rangeDays)
    win.webContents.send('widget:data-update', data)
  } catch {
    // DB may not be initialized yet; silently skip
  }
}

function startAutoRefresh(): void {
  if (refreshTimer) clearInterval(refreshTimer)
  if (quotaRefreshTimer) clearInterval(quotaRefreshTimer)
  if (HUD_MODE) quotaRefreshTimer = setInterval(() => {
    if (hudRefreshPromise || hudAuthenticationPort !== null) return
    void fetchUsageRings(getDashboardPort()).then(rings => { hudRings = rings; win?.webContents.send('hud:data-update', getHudData()) }).catch(() => { hudRings = undefined; win?.webContents.send('hud:data-update', getHudData()) })
  }, 15_000)
  refreshTimer = setInterval(() => {
    if (HUD_MODE) void refreshHudData()
    else pushDataUpdate()
  }, settings.refreshIntervalSec * 1000)
}

async function refreshHudData(force = false) {
  if (hudRefreshPromise) return hudRefreshPromise
  if (!force && hudAuthenticationPort === getDashboardPort()) return unavailableHudData(HUD_AUTH_MESSAGE)
  hudRefreshPromise = (async () => {
    try {
      hudAuthenticationPort = null
      let status = await probeDashboard(getDashboardPort())
      if (status !== 'ready' && status !== 'auth-required') {
        const result = await launchDashboard()
        if (!result.success) throw new Error(result.error ?? 'AIUsage 服务不可用')
        status = await probeDashboard(getDashboardPort())
      }
      if (status === 'auth-required') {
        hudAuthenticationPort = getDashboardPort()
        throw new Error(HUD_AUTH_MESSAGE)
      }
      if (status !== 'ready') throw new Error('AIUsage 服务不可用')
      // CLI ingestion and its serialized write queue own the logs and DB.
      // This HUD cadence also works without a configured CLI refreshInterval.
      await refreshDashboard(getDashboardPort())
      try { hudRings = await fetchUsageRings(getDashboardPort()); hudRingsError = undefined }
      catch (error) { hudRings = undefined; hudRingsError = error instanceof Error ? error.message : '设备用量暂不可用' }
      const data = getHudData()
      win?.webContents.send('hud:data-update', data)
      return data
    } catch (error) {
      const data = unavailableHudData(error instanceof Error ? error.message : '用量刷新失败')
      win?.webContents.send('hud:data-update', data)
      return data
    } finally { hudRefreshPromise = null }
  })()
  return hudRefreshPromise
}

async function openDashboardAction(): Promise<void> {
  if (HUD_MODE) {
    if (!await isDashboardReachable(getDashboardPort())) {
      const result = await launchDashboard()
      if (!result.success) throw new Error(result.error ?? '无法启动本地仪表盘，请先运行 pnpm.cmd build。')
    }
    await openVerifiedDashboardPage()
    return
  }
  const port = getDashboardPort()
  const reachable = await isDashboardReachable(port)
  if (!reachable) {
    // Show widget window so user can see install progress
    showWindow()
    notifyRenderer('install:status', { phase: 'installing' })
    const result = await launchDashboard()
    if (result.success) {
      notifyRenderer('install:status', { phase: 'done' })
    }
    if (!result.success) {
      // CLI not found; attempt auto-install
      const installResult = await installAiusageCli()
      if (!installResult.success) {
        notifyRenderer('install:status', { phase: 'failed', error: installResult.error })
        dialog.showErrorBox(
          'Installation Failed',
          `Could not install @juliantanx/aiusage automatically.\n\n${installResult.error ?? 'Unknown error'}\n\nTry manually:\n  npm install -g @juliantanx/aiusage`
        )
        return
      }
      notifyRenderer('install:status', { phase: 'launching' })
      const retryResult = await launchDashboard()
      if (!retryResult.success) {
        notifyRenderer('install:status', { phase: 'failed', error: retryResult.error })
        dialog.showErrorBox(
          'Launch Failed',
          'AIUsage was installed but the dashboard failed to start.\n\nTry running:\n  aiusage serve'
        )
        return
      }
      notifyRenderer('install:status', { phase: 'done' })
    }
  }
  await openVerifiedDashboardPage()
}

async function openVerifiedDashboardPage(): Promise<void> {
  const port = getDashboardPort()
  const status = await probeDashboard(port)
  if (status !== 'ready' && status !== 'auth-required') throw new Error('AIUsage 服务不可用')
  // The existing protected overview route displays AIUsage's login page.
  // Browser authentication remains in that browser, never in HUD IPC.
  await shell.openExternal(`http://127.0.0.1:${port}${status === 'auth-required' ? '/overview' : ''}`)
}

function notifyRenderer(channel: string, payload: Record<string, unknown>): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

function loadExchangeRateCache(): ExchangeRateState {
  try {
    if (existsSync(FX_CACHE_FILE)) {
      const raw = JSON.parse(readFileSync(FX_CACHE_FILE, 'utf-8')) as ExchangeRateState
      if (raw.base === 'USD' && raw.target === 'CNY' && typeof raw.rate === 'number') {
        return raw
      }
    }
  } catch {
    // Fall through to empty state
  }

  return {
    base: 'USD',
    target: 'CNY',
    rate: null,
    fetchedAt: null,
    source: EXCHANGE_RATE_SOURCE,
  }
}

function saveExchangeRateCache(rate: ExchangeRateState): void {
  const dir = join(homedir(), '.aiusage')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(FX_CACHE_FILE, JSON.stringify(rate, null, 2), 'utf-8')
}

async function refreshExchangeRate(force = false): Promise<ExchangeRateState> {
  const hasFreshRate = exchangeRate.rate !== null &&
    exchangeRate.fetchedAt !== null &&
    Date.now() - exchangeRate.fetchedAt < FX_CACHE_TTL_MS

  if (!force && hasFreshRate) return exchangeRate
  if (exchangeRatePromise) return exchangeRatePromise

  exchangeRatePromise = (async () => {
    try {
      const response = await fetch(EXCHANGE_RATE_SOURCE)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const payload = await response.json() as { date?: string; usd?: { cny?: number } }
      const rate = payload.usd?.cny
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
        throw new Error('USD/CNY rate missing')
      }

      exchangeRate = {
        base: 'USD',
        target: 'CNY',
        rate,
        fetchedAt: Date.now(),
        date: payload.date,
        source: EXCHANGE_RATE_SOURCE,
      }
      saveExchangeRateCache(exchangeRate)
    } catch (error) {
      exchangeRate = {
        ...exchangeRate,
        error: error instanceof Error ? error.message : 'Failed to fetch exchange rate',
        source: EXCHANGE_RATE_SOURCE,
      }
    } finally {
      exchangeRatePromise = null
    }

    return exchangeRate
  })()

  return exchangeRatePromise
}

async function installAiusageCli(): Promise<{ success: boolean; error?: string }> {
  const { execFile } = nodeRequire('child_process') as typeof import('child_process')

  // Try npm first, fall back to pnpm, then yarn
  const managers = ['npm', 'pnpm', 'yarn']

  for (const pm of managers) {
    const args = pm === 'yarn'
      ? ['global', 'add', '@juliantanx/aiusage']
      : ['install', '-g', '@juliantanx/aiusage']

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      execFile(pm, args, { timeout: 120_000, shell: true }, (err, _stdout, stderr) => {
        if (err) {
          resolve({ success: false, error: stderr || err.message })
        } else {
          resolve({ success: true })
        }
      })
    })

    if (result.success) return result
    // If this package manager isn't installed, try the next one
  }

  return { success: false, error: 'No package manager (npm/pnpm/yarn) could install @juliantanx/aiusage.' }
}

function checkCliInstalled(): Promise<boolean> {
  const { execFile } = nodeRequire('child_process') as typeof import('child_process')
  return new Promise((resolve) => {
    execFile('aiusage', ['--version'], { timeout: 10_000, shell: true }, (err) => {
      resolve(!err)
    })
  })
}

function runFirstParse(): Promise<{ success: boolean; error?: string }> {
  const { execFile } = nodeRequire('child_process') as typeof import('child_process')
  return new Promise((resolve) => {
    execFile('aiusage', ['parse'], { timeout: 120_000, shell: true }, (err, _stdout, stderr) => {
      if (err) {
        resolve({ success: false, error: stderr || err.message })
      } else {
        resolve({ success: true })
      }
    })
  })
}

async function autoSetup(): Promise<void> {
  // Show overlay
  notifyRenderer('setup:status', { phase: 'checking' })
  showWindow()

  // Check if CLI is installed
  const cliFound = await checkCliInstalled()

  if (!cliFound) {
    // Install CLI
    notifyRenderer('setup:status', { phase: 'installing' })
    const installResult = await installAiusageCli()
    if (!installResult.success) {
      notifyRenderer('setup:status', { phase: 'failed', error: installResult.error })
      return
    }
  }

  // Run first parse
  notifyRenderer('setup:status', { phase: 'parsing' })
  await runFirstParse()
  // Parse failure is not fatal — user may have no logs yet

  // Open database if it now exists
  if (existsSync(DB_PATH)) {
    db = new Database(DB_PATH, {
      readonly: true,
      nativeBinding: getWidgetNativeBindingPath(__dirname),
    })
  }

  notifyRenderer('setup:status', { phase: 'done' })
  pushDataUpdate()
}

// Renderer reports only painted interactive surfaces; transparent canvas stays click-through.
ipcMain.on('hud:regions', (event, regions: HudArea[], reduced: boolean) => {
  if (!HUD_MODE || event.sender !== win?.webContents || !Array.isArray(regions)) return
  const bounds = win.getBounds()
  hudRegions = regions.slice(0, 4).filter(region => region && [region.x, region.y, region.width, region.height].every(Number.isFinite)
    && region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0
    && region.x + region.width <= bounds.width + 1 && region.y + region.height <= bounds.height + 1)
  // Native shape holes make background clicks fall through immediately, independent
  // of polling. Exclude the outer 8 DIP even when a surface touches the edge.
  const shape = hudRegions.map(region => ({ x: Math.floor(region.x), y: Math.floor(region.y),
    width: Math.max(0, Math.min(Math.ceil(region.x + region.width), bounds.width - 8) - Math.floor(region.x)),
    height: Math.ceil(region.y + region.height) - Math.floor(region.y) })).filter(region => region.width > 0 && region.height > 0)
  const key = JSON.stringify(shape)
  if (key !== hudShapeKey) { win.setShape(shape.length ? shape : [{ x: 0, y: 0, width: 1, height: 1 }]); hudShapeKey = key }
  hudReduced = reduced === true
})
// IPC handlers
ipcMain.handle('hud:get-data', () => getHudData())
ipcMain.handle('hud:refresh', () => HUD_MODE ? refreshHudData(true) : getHudData())
ipcMain.handle('hud:get-state', () => hudState)
ipcMain.handle('hud:set-expanded', (_event, expanded: boolean) => {
  if (HUD_MODE && typeof expanded === 'boolean') {
    hudState.expanded = expanded
    win?.webContents.send('hud:state-update', hudState)
  }
  return hudState
})

ipcMain.handle('widget:get-data', () => {
  if (!db) return null
  return queryWidgetData(db)
})

ipcMain.handle('widget:open-dashboard', async () => {
  await openDashboardAction()
})

ipcMain.handle('widget:get-settings', () => {
  return settings
})

ipcMain.handle('widget:get-exchange-rate', async () => {
  return refreshExchangeRate()
})

ipcMain.handle('widget:save-settings', (_event, newSettings: WidgetSettings) => {
  settings = { ...newSettings, hudDisplayId: newSettings.hudDisplayId ?? settings.hudDisplayId }
  saveSettings(settings)
  if (HUD_MODE) {
    const displayId = getHudDisplayId(screen.getAllDisplays(), settings.hudDisplayId, screen.getPrimaryDisplay().id)
    if (displayId !== hudState.displayId) { hudState.displayId = displayId; positionHud(true) }
  }
  applyTheme(settings.theme)
  startAutoRefresh()
  return settings
})

ipcMain.on('widget:hide-window', () => {
  if (HUD_MODE) {
    hudHover.setEnabled(false)
    hudState.hoverEnabled = false
    updateTrayToolTip()
    win?.webContents.send('hud:state-update', hudState)
    return
  }
  win?.hide()
})

ipcMain.on('widget:resize-window', (_event, height: number) => {
  if (HUD_MODE) return
  if (!win || !Number.isFinite(height)) return

  const bounds = win.getBounds()
  const displayBounds = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea
  const nextHeight = Math.min(
    Math.max(Math.ceil(height), MIN_WINDOW_HEIGHT),
    displayBounds.height
  )

  if (Math.abs(bounds.height - nextHeight) < 2) return

  win.setSize(WINDOW_WIDTH, nextHeight, false)
  if (win.isVisible()) {
    positionWindowNearTray()
  }
})

function getDashboardPort(): number {
  try {
    if (existsSync(PORT_FILE)) {
      const port = parseInt(readFileSync(PORT_FILE, 'utf-8').trim(), 10)
      if (Number.isInteger(port) && port > 0 && port <= 65535) return port
    }
  } catch {}
  return DASHBOARD_PORT
}

async function launchDashboard(): Promise<{ success: boolean; error?: string }> {
  if (dashboardLaunchPromise) return dashboardLaunchPromise
  dashboardLaunchPromise = startDashboard().finally(() => { dashboardLaunchPromise = null })
  return dashboardLaunchPromise
}

async function startDashboard(): Promise<{ success: boolean; error?: string }> {
  const { spawn } = nodeRequire('child_process') as typeof import('child_process')

  return new Promise((resolve) => {
    if (HUD_MODE && !existsSync(LOCAL_CLI_ENTRY)) {
      resolve({ success: false, error: '本地 AIUsage CLI 尚未构建，请运行 pnpm.cmd build。' })
      return
    }
    const child = spawn(HUD_MODE ? 'node.exe' : 'aiusage', HUD_MODE ? [LOCAL_CLI_ENTRY, 'serve', '--port', String(getDashboardPort())] : ['serve'], {
      detached: true,
      stdio: 'ignore',
      shell: !HUD_MODE,
      windowsHide: true,
    })

    let failed = false

    child.on('error', () => { failed = true })

    child.on('close', (code) => {
      if (code !== 0) failed = true
    })

    child.unref()

    let attempts = 0
    const check = async () => {
      if (failed) {
        resolve({ success: false, error: 'aiusage command not found' })
        return
      }
      if (await isDashboardReachable(getDashboardPort())) {
        resolve({ success: true })
        return
      }
      attempts++
      if (attempts >= 25) {
        resolve({ success: false, error: 'Server failed to start within 5 seconds' })
        return
      }
      setTimeout(check, 200)
    }
    check()
  })
}
