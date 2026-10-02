# AI Dev HUD 架构与仓库侦察

## 上游基础

AIUsage 是 pnpm workspace，另有 `packages/site` 承担官方网站/云账号等功能。本产品本轮不依赖它。

| 层 | 现有位置 | 职责 |
| --- | --- | --- |
| provider parsing | `packages/core/src/parsers`、CLI 专用 parser | Codex / Claude 等日志转结构化记录 |
| usage domain | `packages/core/src/types.ts`、聚合器 | `StatsRecord`、tokens、费用、session/device/model 元数据 |
| storage | `packages/cli/src/db` | SQLite schema、迁移、records/tool_calls，保留解析语义 |
| ingestion / local API | `packages/cli/src/commands/parse.ts`、`serve.ts`、`api/server.ts` | 增量解析、loopback HTTP、已有仪表盘 API |
| sync | `packages/cli/src/sync` | 可选 GitHub/S3/cloud，默认不启用 |
| presentation | `packages/web`、`packages/widget` | Svelte 仪表盘、Electron 本地窗口 |

Electron entry 是 `packages/widget/src/main.ts`，输出 `dist/main.js`；启动器是 `bin/launcher.js`。
`BrowserWindow` 在 main 创建，已有 frameless/alwaysOnTop/skipTaskbar/transparent；`preload.ts` 用 contextBridge 暴露 IPC，contextIsolation 开启、nodeIntegration 关闭。
widget 主进程以 readonly SQLite 打开同一 usage DB，`data.ts` 把 SQL 聚合变成 `WidgetData` 后由 IPC 推送。renderer 不解析日志、不访问 DB。

Codex parser 在 `packages/core/src/parsers/codex.ts`，跟踪 turn_context/model、token_count、tool_calls。`StatsRecord.tool='codex'`。
上游 widget 的今日查询按本地午夜对 records 汇总，但混合所有工具；HUD 需在相同主进程数据层增加 Codex 过滤的类型化查询。
已有仪表盘：`node packages/cli/dist/index.js serve`，loopback 默认 `127.0.0.1:3847`；原页面在 web build，CLI 构建复制到 `dist/web`。`/api/summary?range=day&tool=codex` 可作数据交叉验证。

## Phase 1 实现计划（产品修改前确定）

1. 优先扩展 `packages/widget`，增加显式 `--hud` 模式，保留上游默认 tray widget。
2. 新增主进程 Codex 用量 adapter，输出有类型的 HUD snapshot：今日/7 天 tokens、sessionCount、usageRecordCount、models、cost、状态；不重写 parser。
3. 单独 HUD renderer，经 preload 调用有限 IPC；禁止 UI 文件系统/日志/SQL 访问。
4. 用纯函数计算 selected display 的 workArea 右边界：`x = workArea.x + workArea.width - window.width`。折叠 56 DIP，展开向左；screen display 事件触发重新定位。runtime 持有展开态和 monitor id。
5. Dashboard 使用仓库现有 CLI；若服务不可达则启动该 checkout 的 CLI，再调用 shell.openExternal。默认 loopback，不配置云同步。
6. 单元测试数据过滤/边界/定位，真实 Windows Electron 自动化验证 bounds、DPI、折叠/展开、数据一致性、按钮和原 widget；截图/私有 DB 留在仓库外。

## 数据与 ABI

Node CLI 和 Electron 的 Node ABI 不同。上游已给 Electron SQLite binding 单独 `dist/native`，不得把它当 Node CLI binding 使用。
Windows 构建需用 Node `fs.rmSync` 代替 shell `rm -rf`。测试 fixture 需隔离 USERPROFILE，避免读到开发者 Cursor transcripts。
全套 Windows 测试经独立 profile/AppData 运行。`prepare-native-binding.js` 用 Electron 真正加载 binding 验证 ABI，必要时复用上游 staged installer；`ensure-node-binding.js` 先验证 Node binding，避免 dashboard 运行时重复重建锁住的 DLL。

本机验证用独立运行目录，child process 的测试 home 指向该目录，同时 `AIUSAGE_CODEX_PATH` / `AIUSAGE_CLAUDE_CODE_PATH` 指向只读现有来源。不复制原始日志，不修改另一实验，不上传 DB。
产品正常运行沿用 AIUsage 的本地数据库；将来同步只经 replaceable sync adapter，不从 UI 发起原始内容同步。

## 审查后刷新与服务识别

HUD 默认每 60 秒经主进程调用现有 `POST /api/refresh`，由 CLI 的写队列执行增量解析，然后推送 typed snapshot；按钮/托盘刷新也走同一路径。并发刷新和服务启动共用进行中的 Promise。不会改变用户 CLI 配置，也不依赖 config.refreshInterval 是否存在。原 widget 仍按原机制读取快照。

`dashboard-client.ts` 使用本机 loopback，拒绝重定向。状态区分 ready、auth-required、absent、unrelated、unavailable。先核验 AIUsage 静态页面主题标记及公开 `/api/auth/status` 布尔结构；无须认证时还核验 summary 结构与刷新 GET 的 405/METHOD_NOT_ALLOWED 契约。需认证时必须同时满足 enabled=true、authenticated=false、summary 返回 401/UNAUTHORIZED，任意 401 不足以识别 AIUsage。原 widget/HUD 可打开已有 `/overview` 登录页；HUD 暂停自动探测/解析直到手动重查或端口变化，不重复启动/安装服务，不索取或传递密码及浏览器 cookie。

使用上游 CLI 的递增端口重试和 `.serve-port` 发现新端口，不停止占用端口的其他服务。这是对当前 1.5.19 页面/API 的适配，未来升级上游需重新验证契约。

日期边界分别用年月日构造今日、明日、六天前的本地午夜，避免午夜 DST 归一到 01:00 后影响其他日期。

## 本轮不做

新 dashboard、多设备 UI、Codex Home、Project Engine、Launcher、AppBar、自动启动、全屏隐藏、Unity/Unreal 集成。当前追加实现边缘唤起原窄条，详细摘要仍由显式展开控制。

## 用户追加的边缘动画适配

`hud-hover.ts` 是纯时间驱动状态机：全局 DIP 指针和目标窗口矩形输入，输出 reveal/visible/interactive，不接触 provider 或存储。边缘进入 140ms、离开 450ms 缓冲，临界阻尼保留反向速度并收敛到 0/1。main 在隐藏时约 40ms、显示/动画时约 16ms 轮询；仅 showInactive，不调用 focus，隐藏后 HWND 也 hide。指针不在露出的内容区或位于右缘 4 DIP 时，原生窗口忽略鼠标事件。

renderer 经现有 typed IPC 接收 reveal，translateX 在原透明 HWND 内裁切；窗口右缘不移动，避免相邻显示器显示离屏内容。显示器变化重置 reveal；展开偏好保持。真实 150%→100% 换屏发现 Windows 异步宽度调整，main 在 80/200/500ms 仅修正偏离目标的 bounds，取消旧复核，退出时清理 timer。
