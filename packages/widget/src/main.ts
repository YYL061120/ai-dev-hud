import { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, dialog, screen, nativeTheme } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { EXCHANGE_RATE_SOURCE } from './currency'
import type { ExchangeRateState } from './currency'
import { queryWidgetData } from './data'
import { queryHudData, unavailableHudData } from './hud-data'
import { getHudBounds } from './hud-window'
import type { HudState } from './hud-window'
import { isDashboardReachable, refreshDashboard } from './dashboard-client'
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
let hudState: HudState = { expanded: false, displayId: 0 }
let hudRefreshPromise: Promise<ReturnType<typeof getHudData>> | null = null
let dashboardLaunchPromise: Promise<{ success: boolean; error?: string }> | null = null

let tray: Tray | null = null
let win: BrowserWindow | null = null
let db: InstanceType<typeof Database> | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null
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
    hudState.displayId = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id
    screen.on('display-added', () => positionHud())
    screen.on('display-removed', () => positionHud())
    screen.on('display-metrics-changed', () => positionHud())
  }
  createTray()
  createWindow()
  startAutoRefresh()
  if (!HUD_MODE) void refreshExchangeRate()

  if (HUD_MODE) {
    showWindow()
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
  db?.close()
})

function applyTheme(theme: WidgetSettings['theme']): void {
  nativeTheme.themeSource = theme
}

function createTray(): void {
  const { buffer, scaleFactor } = getTrayIconNativeImage()
  const icon = nativeImage.createFromBuffer(buffer, scaleFactor ? { scaleFactor } : undefined)
  tray = new Tray(icon)
  tray.setToolTip(HUD_MODE ? 'AI Dev HUD · Codex' : 'AIUsage Widget')

  tray.on('click', () => toggleWindow())
  tray.on('right-click', () => {
    const i18n = t(settings.locale)
    const menu = Menu.buildFromTemplate([
      { label: i18n.showPanel, click: () => showWindow() },
      { label: i18n.openDashboard, click: () => openDashboardAction() },
      { label: i18n.refresh, click: () => { if (HUD_MODE) void refreshHudData(); else pushDataUpdate() } },
      ...(HUD_MODE ? [{ label: '显示器', submenu: screen.getAllDisplays().map((display, index) => ({
        label: `${index + 1} · ${display.label || `${display.size.width} × ${display.size.height}`}`,
        type: 'radio' as const,
        checked: display.id === hudState.displayId,
        click: () => { hudState.displayId = display.id; positionHud(); showWindow() },
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

  if (!HUD_MODE && shouldHideWindowOnBlur(app.isPackaged)) {
    win.on('blur', () => win?.hide())
  }
}

function showWindow(): void {
  if (!win) return

  if (HUD_MODE) positionHud()
  else positionWindowNearTray()
  win.show()
  win.focus()
  pushDataUpdate()
  if (!HUD_MODE) schedulePositionRetries()
}

function positionHud(): void {
  if (!win) return
  const display = screen.getAllDisplays().find(display => display.id === hudState.displayId)
    ?? screen.getPrimaryDisplay()
  hudState.displayId = display.id
  win.setBounds(getHudBounds(display.workArea, hudState.expanded), false)
  win.webContents.send('hud:state-update', hudState)
}

function getHudData() {
  try {
    if (!db && existsSync(DB_PATH)) {
      db = new Database(DB_PATH, { readonly: true, nativeBinding: getWidgetNativeBindingPath(__dirname) })
    }
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
  refreshTimer = setInterval(() => {
    if (HUD_MODE) void refreshHudData()
    else pushDataUpdate()
  }, settings.refreshIntervalSec * 1000)
}

async function refreshHudData() {
  if (hudRefreshPromise) return hudRefreshPromise
  hudRefreshPromise = (async () => {
    try {
      if (!await isDashboardReachable(getDashboardPort())) {
        const result = await launchDashboard()
        if (!result.success) throw new Error(result.error ?? 'AIUsage 服务不可用')
      }
      // CLI ingestion and its serialized write queue own the logs and DB.
      // This HUD cadence also works without a configured CLI refreshInterval.
      await refreshDashboard(getDashboardPort())
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
    await shell.openExternal(`http://127.0.0.1:${getDashboardPort()}`)
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
  shell.openExternal(`http://localhost:${getDashboardPort()}`)
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

// IPC handlers
ipcMain.handle('hud:get-data', () => getHudData())
ipcMain.handle('hud:refresh', () => HUD_MODE ? refreshHudData() : getHudData())
ipcMain.handle('hud:get-state', () => hudState)
ipcMain.handle('hud:set-expanded', (_event, expanded: boolean) => {
  if (HUD_MODE && typeof expanded === 'boolean') {
    hudState.expanded = expanded
    positionHud()
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
  settings = newSettings
  saveSettings(settings)
  applyTheme(settings.theme)
  startAutoRefresh()
  return settings
})

ipcMain.on('widget:hide-window', () => {
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
