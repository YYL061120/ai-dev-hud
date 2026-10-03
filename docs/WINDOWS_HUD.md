# Windows HUD 使用与验证

## 启动

在 `C:\AI-Tools\ai-dev-hud`：

```powershell
pnpm.cmd start:hud
```

该命令构建并启动 HUD。已构建时直接启动：

```powershell
node packages/widget/bin/launcher.js --hud
```

前台调试用 `--foreground --hud`。原 widget 保持 `pnpm.cmd start:widget` / `node packages/widget/bin/launcher.js`。

HUD 默认选 Windows 主显示器；托盘选择的显示器会保存到 widget-settings.json，重启恢复，屏幕不存在时回主屏。HUD 默认隐藏，在所选屏幕整个可用右缘内侧32 DIP停留约140ms唤起；150%主屏对应约48物理像素，不必卡在主副屏接缝的精确一像素。最后8 DIP保持点击穿透，面板按钮仍可点击，悬停不抢焦点。离开后450ms缓冲再收回；任务栏不触发。

托盘悬停提示显示“边缘唤起已启用/已暂停”和所选屏幕名称。右键托盘图标 → 显示器，可切换目标，换屏后等待新的边缘悬停。展开/折叠按钮位于窄条底部；Esc 折叠；点击托盘图标禁用/恢复边缘唤起，保留本次展开态和目标屏幕。右键“启用边缘唤起”可直接恢复，菜单也显示当前状态；Quit 退出。

动画在固定右缘窗口内部裁切，保留原圆角、窄条和展开布局。跨不同 DPI 显示器时，短暂复核原生窗口尺寸，修正 Windows 异步调整；不改变系统 DPI 或桌面设置。

默认只读 AIUsage 的 `%USERPROFILE%\.aiusage\cache.db`。HUD 会启动本仓库构建好的 AIUsage CLI `serve`，由 CLI 增量解析，UI 不读取原始日志。后台 CLI 服务和 HUD 是独立进程；退出 HUD 后 dashboard 可继续运行。

HUD 默认每 60 秒请求 CLI 刷新，即使 AIUsage 配置没有 refreshInterval 也会持续导入。展开面板与托盘的刷新会立即请求增量解析，再更新显示；失败会显示不可用状态。不会修改用户 CLI 的刷新间隔。端口被其他应用占用时 CLI 自动尝试下一端口，HUD 验证真实 AIUsage 页面/API 后才打开。

若已有 AIUsage 服务设置 `AIUSAGE_DASHBOARD_PASSWORD`，HUD 会显示需要登录并暂停自动解析；打开仪表盘直接进入原登录页，原 widget 也使用该服务，不新增进程或安装 CLI。密码由用户在现有浏览器页面自行处理。HUD 不读取密码或共享浏览器登录 cookie；密码保护仍启用时，HUD 后台解析保持暂停，原仪表盘可按其现有流程使用。手动刷新仅重新检查服务状态，不修改认证配置。

## 数据语义

今日采用本机日历日，近 7 天包含今日及之前 6 个日历日。只展示本机 `origin=local` 的 `tool=codex` records。
tokens 沿用 AIUsage 现有输入/输出/缓存/推理合计；session 去掉空 ID 后去重；“用量记录”是已解析 SQLite row 数，不称为请求数。
费用沿用已有价格估计，非订阅账单。解析器未能获得的模型或价格不会在 HUD 中额外推断。
有 tokens 而 AIUsage 费用为零时显示“暂无估价”，避免暗示免费。

56 为 Electron DIP；150% 缩放对应 84 个物理像素。用 workArea 右边界定位，不占用桌面空间。本轮不会增加开机启动、全屏隐藏、云依赖或内容同步。

## 本机工具路径

若 pnpm 不在 PATH，可在当前 PowerShell 临时设置：

```powershell
$env:PATH = 'C:\AI-Tools\.ai-dev-hud-tools\node_modules\.bin;' + $env:PATH
```

不要为了使用 `.ps1` 改安全策略，使用 `.cmd`。锁定版本仍来自仓库 packageManager `pnpm@9.15.0`。

## 验证证据

详细记录见 PROJECT_STATE.md。私人数据、自动化脚本、日志和截图保存在仓库外 `C:\AI-Tools\ai-dev-hud-evidence`，不推送远端。

## 仪表盘语言

打开已有 Dashboard 后，在页面右上方选择“中文”或“English”。侧栏收起和移动窗口时入口仍显示；密码登录页也可切换。浏览器会记住选择，刷新及访问其他页面沿用同一语言。切换保留日期/工具筛选；模型名、provider 和项目路径保持原数据。货币设置仍在原设置页独立控制。
