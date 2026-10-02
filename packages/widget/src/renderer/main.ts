import App from './App.svelte'
import Hud from './Hud.svelte'
import type { HudAPI } from '../preload'

const Renderer = (window as Window & { hud: HudAPI }).hud?.enabled ? Hud : App
const app = new Renderer({ target: document.getElementById('app')! })

export default app
