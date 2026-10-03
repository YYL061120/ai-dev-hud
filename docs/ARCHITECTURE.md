# AI Dev HUD 架构与仓库侦察

## 设备用量圈追加

`core/usage-rings.ts` 定义 version 1 `UsageRingsSnapshot`，复用 metadata 的 token 五类求和、设备/记录去重与本地自然日边界。总圈是总量标识；设备弧为 `device.tokens / total.tokens`，无分母时为 null，不表示订阅额度。旧历史中的设备在较短周期可有真实零值，未采集设备不会生成身份。tool/provider/model 分组保留真实来源；`estimatedCost` / `cost` 为 null 时无估值，部分缺失单列数量。

CLI 在 `UsageMetadataStore.overview()` 已有本机优先的 records + 手动 metadata 路径上附加 rings；不叠加 synced_records。`ringPeriods=all` 一次读取、一次时钟生成四周期，避免 HUD 四次加载完整历史。`hud_usage_import_receipts` 仅记录本机接受导入的时间，不改变上游 schema 或 version 1 导出；历史缺失不借用日志时间冒充接收时间。

`web/lib/components/UsageRings.svelte` 为本地页和 widget 共用。SVG 弧、数字用 320 ms 有限 requestAnimationFrame 插值，反向从当前值继续；浮层只用 transform/opacity、最多一个明细，键盘 / 触屏 / Escape 可操作，减少动态效果和隐藏状态立即停止插值。HUD 明细有独立滚动区，保持 Dashboard 按钮可点。renderer 只消费 typed snapshot；widget main 经 loopback API 缓存四周期并由既有串行刷新更新，不逐帧请求或在 UI 解析日志。

独立复核补齐响应布局：ResizeObserver 观察圈组宽高并重算正在打开的明细位置，不切换 activeKey、不重建焦点按钮；销毁时断开观察。HUD 圈槽高度限制为104 DIP并可滚动，明细在HUD中参与内容流；summary-scroll独立滚动，header/period/footer/update不收缩，因此多行/更多设备不会把Dashboard推出536 DIP窗口或由明细挡住。网页保留原浮层布局。真实生产组件回归见 scripts/verify-ring-layout.cjs（需已构建及可用Playwright/Chromium）；数据/窗口/边缘控制器不变。

现有 `hud-hover.ts` / `hud-window.ts` 未改：32 DIP 感应、外侧 8 DIP 点击穿透、140 ms 唤起 / 450 ms 收回、右边缘固定并向左展开。视频只用于槽、细环、颜色和明细形式；未知配额、回本倍数、帧率参数均不引入。未开启外部同步。

## 上游基础

独立复核收紧 metadata 标识/枚举边界，不改变provider parser或原SQL记录；Launcher在进程创建前校验登记canonical目录未重定向，并只在新Windows控制台子环境去除TERM=dumb。实际进程和认证界面已由隔离UI/native验收，登录和任务执行不属于该测试。

第二批扩展：core `usage-metadata.ts` 提供白名单版本、严格校验、日历汇总与可替换同步契约；CLI `UsageMetadataStore` 只读local-origin records的字段投影、散列身份，并以独立metadata表接收显式导入；API复用原SQLite写队列，web `/local-usage` 只使用typed client。不存在默认网络adapter，实际状态与限制见 `USAGE_METADATA.md`。缺少state.json时只创建上游标准稳定身份，既有状态文件不覆盖。

最新本地扩展：core `local-control.ts` 定义项目/启动契约；CLI `local-control/` 处理文件/Git/登记与交互启动，`api/local-control.ts` 在既有认证/同源保护后增加本机限定；web `/codex` 消费 typed client。登记持久化在用户 `.aiusage/projects.json`，与 usage/sync 数据分开。提示预览只引用约定文档，不自动嵌入内容或发出 AI 请求。下方“不做”是历史 Phase 1 范围，新用户追加按 `LOCAL_CONTROL_PLAN.md` 推进。

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

`hud-hover.ts` 是纯时间驱动状态机：全局 DIP 指针、目标窗口矩形、所选显示器工作区输入，输出 reveal/visible/interactive，不接触 provider 或存储。整个workArea右缘内侧32 DIP唤起，与隐藏面板高度无关；最后8 DIP点击穿透，二者分开以保留rail按钮点击。任务栏不触发。进入140ms、离开450ms缓冲，临界阻尼保持反向速度，main隐藏40ms/显示16ms轮询，showInactive不focus。`WidgetSettings.hudDisplayId`保存目标屏，默认/失效回主屏；旧widget设置保存保留该字段。

renderer 经现有 typed IPC 接收 reveal，translateX 在原透明 HWND 内裁切；窗口右缘不移动，避免相邻显示器显示离屏内容。显示器变化重置 reveal；展开偏好保持。真实 150%→100% 换屏发现 Windows 异步宽度调整，main 在 80/200/500ms 仅修正偏离目标的 bounds，取消旧复核，退出时清理 timer。

## 原 Dashboard 语言扩展

沿用 `packages/web/src/lib/i18n.js` 的 en/zh 字典与 Svelte store，以及 `aiusage-lang` 持久化 key。共用 LanguageSwitch 显示顶部双按钮，setLang 只改变语言，不重挂载页面或重新解析 usage。页面格式化显式传 `$lang`，确保会话日期等内容立即响应切换；金额仍沿用原币种/精度规则。日期-only bucket 构造本地年月日。provider、model、项目路径直接呈现原数据，不经过翻译。没有引入语言服务、云依赖或自建 dashboard。

## 本地有界历史传输

`usage-transfer.ts` 只定义容器 header/footer 和任务进度；record 内容继续使用 version 1 usage allowlist。`UsageMetadataStore.exportChunks()` 使用专用 readonly WAL 快照、1,000 条 keyset 批次与磁盘 TEMP 身份索引。本机记录优先；后台导入表不改 provider/parser 表。export jobs 仅保留计数，最多一个活动任务、八个历史状态，下载十分钟超时，HTTP 断开/取消释放快照；HTTP 原有鉴权/Origin/loopback 门禁保留。旧 JSON API 有界收集并明确提示使用分块导出。

导入按 2 MiB 最大行解析，不读取全部 JSONL；每块使用旧原子导入和写入队列。TEMP 本机身份索引由 database 对象共享，依据 total_changes/data_version 和设备身份失效；确认导入写入后更新缓存版本，因此不会每个块重新扫描完整 provider 历史。完整文件必须有计数匹配且位于末尾的 footer。取消保留已确认块，网络丢失响应标记未知最后一块，重试去重；没有全文件事务/自动回滚。浏览器原生下载负责磁盘输出，界面展示服务端传输计数和状态。

官方 Codex 元数据状态只通过官方 executable 的 daemon version 命令检查现有 transport；不启动任何服务。当前无法连接，公开 thread/list/useStateDbOnly 可行性记录在 PROJECT_STATE，尚不发起 thread/read/list，也不扫描原始会话。同步 adapter 仍只是显式配置契约；当前没有外部 adapter 执行。
