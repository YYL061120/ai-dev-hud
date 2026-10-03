import { contextBridge, ipcRenderer } from 'electron'
import type { WidgetData } from './data'
import type { WidgetSettings } from './settings'
import type { ExchangeRateState } from './currency'
import type { HudData } from './hud-data'
import type { HudState, HudArea } from './hud-window'

export interface HudAPI {
  enabled: boolean
  setRegions: (regions: HudArea[], reduced: boolean) => void
  getData: () => Promise<HudData>
  refresh: () => Promise<HudData>
  getState: () => Promise<HudState>
  setExpanded: (expanded: boolean) => Promise<HudState>
  openDashboard: () => Promise<void>
  onDataUpdate: (callback: (data: HudData) => void) => () => void
  onStateUpdate: (callback: (state: HudState) => void) => () => void
}

contextBridge.exposeInMainWorld('hud', {
  enabled: process.argv.includes('--ai-dev-hud'),
  setRegions: (regions: HudArea[], reduced: boolean) => ipcRenderer.send('hud:regions', regions, reduced),
  getData: () => ipcRenderer.invoke('hud:get-data'),
  refresh: () => ipcRenderer.invoke('hud:refresh'),
  getState: () => ipcRenderer.invoke('hud:get-state'),
  setExpanded: (expanded: boolean) => ipcRenderer.invoke('hud:set-expanded', expanded),
  openDashboard: () => ipcRenderer.invoke('widget:open-dashboard'),
  onDataUpdate: (callback: (data: HudData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: HudData) => callback(data)
    ipcRenderer.on('hud:data-update', listener)
    return () => ipcRenderer.removeListener('hud:data-update', listener)
  },
  onStateUpdate: (callback: (state: HudState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: HudState) => callback(state)
    ipcRenderer.on('hud:state-update', listener)
    return () => ipcRenderer.removeListener('hud:state-update', listener)
  },
} satisfies HudAPI)

export interface InstallStatus {
  phase: 'installing' | 'launching' | 'done' | 'failed'
  error?: string
}

export interface WidgetAPI {
  getData: () => Promise<WidgetData>
  openDashboard: () => Promise<void>
  hideWindow: () => void
  resizeWindow: (height: number) => void
  onDataUpdate: (callback: (data: WidgetData) => void) => void
  onInstallStatus: (callback: (status: InstallStatus) => void) => void
  onSetupStatus: (callback: (status: InstallStatus) => void) => void
  getSettings: () => Promise<WidgetSettings>
  saveSettings: (settings: WidgetSettings) => Promise<WidgetSettings>
  getExchangeRate: () => Promise<ExchangeRateState>
}

contextBridge.exposeInMainWorld('widget', {
  getData: () => ipcRenderer.invoke('widget:get-data'),
  openDashboard: () => ipcRenderer.invoke('widget:open-dashboard'),
  hideWindow: () => ipcRenderer.send('widget:hide-window'),
  resizeWindow: (height: number) => ipcRenderer.send('widget:resize-window', height),
  onDataUpdate: (callback: (data: WidgetData) => void) => {
    ipcRenderer.removeAllListeners('widget:data-update')
    ipcRenderer.on('widget:data-update', (_event, data) => callback(data))
  },
  onInstallStatus: (callback: (status: InstallStatus) => void) => {
    ipcRenderer.removeAllListeners('install:status')
    ipcRenderer.on('install:status', (_event, status) => callback(status))
  },
  onSetupStatus: (callback: (status: InstallStatus) => void) => {
    ipcRenderer.removeAllListeners('setup:status')
    ipcRenderer.on('setup:status', (_event, status) => callback(status))
  },
  getSettings: () => ipcRenderer.invoke('widget:get-settings'),
  saveSettings: (settings: WidgetSettings) => ipcRenderer.invoke('widget:save-settings', settings),
  getExchangeRate: () => ipcRenderer.invoke('widget:get-exchange-rate'),
} satisfies WidgetAPI)
