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

HUD 启动时选鼠标当前所在显示器。右键托盘图标 → 显示器，可切换目标。展开/折叠按钮位于右侧窄条底部；Esc 折叠；点击托盘图标隐藏/恢复并保留本次运行状态。右键托盘的 Quit 退出。

默认只读 AIUsage 的 `%USERPROFILE%\.aiusage\cache.db`。HUD 会启动本仓库构建好的 AIUsage CLI `serve`，由 CLI 增量解析，UI 不读取原始日志。后台 CLI 服务和 HUD 是独立进程；退出 HUD 后 dashboard 可继续运行。

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
