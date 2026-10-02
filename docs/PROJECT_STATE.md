# 项目状态

更新：2026-10-02。Phase 0、Phase 1 及用户追加的边缘唤起/网页语言均已验收。后续阶段禁止提前实现。

## 用户追加工作：完成并停止

用户明确授权边缘悬停滑入/收回和 Dashboard 中英文可见切换。起始工作区干净；已实际查看 Library 参考图，是现有 Codex 窄条，保持外观。截图经当前 Library 助手取到 Windows，身份属性经 NTFS 命名流写入/校验，保存于仓库外。两项完成并独立提交，不开始后续阶段。

追加工作门禁：`pnpm.cmd build` exit 0；完整测试最初在 Windows 沙箱失败，原因是上游 Grok fixture 硬编码 `/tmp`，实际落到不可写的 `C:\tmp`。改为系统 tmpdir 下 mkdtemp 创建的独占目录，仅清理本用例创建的目录；保留全部断言，无新增 skip。修复后 `pnpm.cmd test` exit 0：1,083 passed、1 个上游 skip、0 failed，120 个测试文件（core 117 / web 39 / widget 50 / CLI 839 / site 38）。单独 web 39、widget 50 项测试和对应构建也通过。日志在仓库外 `followup-full-build.log`、`followup-full-tests.log`。临时目录修复 commit `6739374`；边缘 HUD commit `fa9a860`；完整交付 HEAD 见本机晨间报告和 `git rev-parse HEAD`。

### 边缘 HUD：已验收

- 默认 reveal=0、原生窗口不可见；140ms 边缘停留后连续滑入，450ms 离开缓冲后收回。临界阻尼可反向，圆角/窄条/展开内容沿用原布局，窗口内裁切。
- `node C:\AI-Tools\.ai-dev-hud-tools\verify-hover.cjs`：exit 0，实际 Windows Electron，两个显示器 scaleFactor=1.5/1。两屏 collapsed=56×216 DIP、expanded=376×536 DIP，右缘正确；实际物理鼠标转 DIP 逐次核对，悬停前后 Win32 foreground 保持，HUD 未聚焦。
- 每屏原生边缘点击实际传到测试背景 DOM（有普通内容点击阳性对照）；三轮短暂离开/返回、关闭中反向、托盘暂停/恢复、动画中换屏均通过。保留展开偏好；Today fixture=120，Open Dashboard 实际 shell.openExternal 返回正确独占端口且 HTTP 200，0 pageerrors。
- 混合 DPI 实测发现隐藏窗口跨屏后宽度变成 48 DIP；加入有限 bounds 复核后，两屏均稳定为 56 DIP。未修改系统 DPI、显示器排列或安全设置。
- 验证 harness 修正：输入助手启用线程 DPI awareness；背景测试窗口移除 resize 边框；显式轮询等待异步 IPC 条件；用本地编译输入助手减少进程启动延迟。没有删除产品断言。核对并暂时停止原旧版项目 HUD（PID 47132）避免叠窗，验收后已通过原 launcher 在真实用户目录恢复新版 PID 30020，进程命令行确认是本仓库 `--hud`。新版默认隐藏，等待用户边缘悬停。
- 证据：仓库外 `hover-verification.json`、`hover-verification.log`、`hover-collapsed-<displayId>.png`、`hover-expanded-<displayId>.png`。实际查看截图确认原布局。未实测物理拔插显示器、系统睡眠/唤醒和全屏交互；负坐标由单测覆盖。显示器菜单经真实 Tray Menu 的回调选择，未模拟实体鼠标点击托盘菜单。

### 原 Dashboard 中英文：已验收

- 复用现有 i18n 字典/store，增加顶部“中文 / English”按钮，普通页面、公开首页和密码登录页可见。沿用 `aiusage-lang` localStorage key；未设置时按浏览器语言，损坏偏好回退，存储异常时语言模块仍可在内存切换。HTML lang 与选择同步，缺失翻译回退英文。
- 保持页面实例和筛选状态；补齐首页 LIVE/缓存读写、关闭按钮、设置凭据字段/兼容服务标签。数字/日期采用 zh-CN/en-US；日期-only 桶按本机日历，不产生 UTC 前一天偏移。币种、金额精度、token 单位和源模型/provider/项目路径语义不变。
- `node C:\AI-Tools\.ai-dev-hud-tools\verify-language.cjs` exit 0：真实 Windows Edge 的生产 CLI 页面，中文与英文刷新持久化；切换时本周/Codex 筛选保持；首页、概览、Token/费用图表与日期月份选项、模型、会话、项目、工具调用、配额、定价、设置检查通过。会话日期即时切换格式，原模型名及合成项目路径逐字保持。
- 桌面 1440×1000、移动 390×844、收起侧栏后的入口可见。合成 Codex=120、Claude=40、总计160由真实现有 parser/CLI 导入，切换前后 API 及显示值一致；原 widget 真实可见/置顶、输入130/输出30/总计160。0 pageerrors。未触发同步、排行榜上传或连接授权。
- `verify-followup-auth.cjs` exit 0：独占随机密码 fixture，中文登录页刷新保留；未提交密码，summary 仍401。HUD 默认隐藏且暂停完整60秒周期；12次初始识别/打开探测后无额外请求，0解析 POST、0额外 spawn、0安装。原 widget 也打开同一已有登录地址，0 spawn/安装。既有认证修复仍有效。
- GUI harness 最初误用“今日”筛选和 `.page-header` 定价标题，改成上游实际“今天”和 `h1.page-title`；认证页标题大小写校正。完整断言保留后通过。实际查看中/英文、移动端及 HUD 截图。
- 证据在仓库外 `language-verification.json`、`language-verification.log`、`dashboard-chinese-{overview,settings,home,login}.png`、`dashboard-english-overview.png`、`dashboard-mobile-language.png`、`followup-original-widget.png`、`followup-auth-verification.{json,log}`。网页截图使用 Windows Edge headless 渲染；HUD 鼠标/焦点/穿透检查使用原生 Windows 输入。新 GUI 用合成数据；真实 provider 来源已在前一基线/回归只读验收，parser 本轮未修改。

## 仓库

- 目录：`C:\AI-Tools\ai-dev-hud`
- origin：`https://github.com/YYL061120/ai-dev-hud.git`
- upstream：`https://github.com/juliantanx/aiusage.git`
- 个人仓库经 GitHub API 确认是 fork，parent 为 juliantanx/aiusage。
- 上游基线：`85b86874f579f4627456de89b102f016d489ce27`（1.5.19）。远端与本地 main 一致。
- 开发分支：`feat/windows-hud-mvp`；main 保持上游。本轮限 Phase 0 / Phase 1 及明确追加的边缘唤起/语言，已到停止条件。
- GH CLI 未登录，GitHub connector 已认证 YYL061120。Git 的已有凭据支持非交互 push；Phase 0 开发分支已成功推送，不需用户认证。

## 环境

Windows 10.0.26200、PowerShell 7.6.5、Git 2.55.0.windows.5、Node 24.21.0、npm 11.19.0、pnpm 9.15.0（packageManager 固定）、GH CLI 2.102.0。
pnpm / GH CLI 安装在 `C:\AI-Tools\.ai-dev-hud-tools`，不降低执行策略。沙箱下使用 per-command safe.directory。

## 基线验证

- `pnpm.cmd install --frozen-lockfile`：通过，662 包，Electron 33.4.11 Windows x64 SQLite binding 安装成功。
- 原始 `pnpm.cmd build`：失败；widget shell `rm` 不存在，core/web/CLI 构建通过。
- 原始 `pnpm.cmd test`：CLI 3 个 Cursor fixture 测试读到 USERPROFILE 的真实 transcripts；其他包通过。
- 修复：Node fs 清理生成 renderer；Cursor fixture stub USERPROFILE。没有新增 skip，没有修改 parser。
- 修复后完整构建：通过。
- 修复后 `pnpm.cmd test`：1,049 passed、1 skipped、0 failed（core 117 / web 32 / widget 23 / CLI 839 / site 38）。上游 Windows 原本跳过的 POSIX 文件权限用例保持原样。
- 实际 Codex/Claude ingestion：通过；只读现有来源，隔离 home/AppData 的仓库外 SQLite 中有两者的非空记录。
- 原仪表盘：页面与 `/api/summary?range=day&tool=codex` HTTP 200，Edge 页面加载、截图、0 pageerrors。
- 原 Windows Electron widget：实际可见、置顶、有可读取的 WidgetData，截图通过；两个实际显示器 scaleFactor 为 1.5 和 1。
- 自动化初次失败：API range=today 非合法参数，改为上游 day；隔离 AppData 目录缺失造成 Electron abort，创建目录后成功；验证脚本误用不存在的 hasFrame API 已修正。均属验证 harness 修正，无绕过安全设置。
- 后续只读检查发现原上游整套测试会创建用户 `.aiusage/config.json`（本次测试创建时间 11:55:26，本机 Pacific 时间）。未创建该位置的 usage DB；Cursor 多导入的记录只落在 `:memory:` 测试库，来源数据库 readonly。测试配置仅含 priceOverrides，未配置 sync/上传；精确核对创建/修改时间后，把本轮新建文件移到仓库外 `ai-dev-hud-evidence/upstream-test-config.json`，前后 SHA256 一致，恢复原先无配置文件的状态。没有删除用户数据。现在用 `scripts/test-isolated.cjs` 隔离整套 Windows 测试进程的 profile/AppData，防止再写用户配置；该修复独立提交。
- 后续原生验证发现上游 widget test 总是 rebuild Node SQLite，dashboard 占用 DLL 时触发 EBUSY。独立修复为先实际验证 Node ABI，构建通过 Electron ABI 验证与 staged installer，避免修改正在使用的共享 Node binding。没有跳过实际测试。

## 交付与门禁

AGENTS.md、PRD、ARCHITECTURE、ROADMAP 已建立。Phase 0 commit `508aa09a4af3310585fef71955be196a523aad05`，annotated tag `baseline-aiusage` 指向该验证后的修复基线，main 仍为原上游提交。
额外隔离修复 commit `6577fce9665fdfdae03659481503543437ccb9fd`；ABI 修复 commit `9a1564c8dead2840a623137c24fcd7808e8cd246`。这些与 HUD 功能变化分开提交。
Phase 0 门禁先通过后进入 Phase 1；产品修改前的侦察和计划见 ARCHITECTURE.md。
证据目录：`C:\AI-Tools\ai-dev-hud-evidence`。私人日志内容、DB、截图不得进入提交。

## Phase 1 验证完成

- `--hud` 模式扩展现有 widget；原默认模式保留。新增 typed HudData adapter、contextBridge IPC、Svelte HUD、显示器工作区定位。
- 折叠 56 DIP × 216；展开 376 × 536，向左扩展，右边界保持；frameless、alwaysOnTop、skipTaskbar、transparent 配置。
- 今日/7 天本机 Codex tokens、非空 session 去重、usage records、模型拆分、API 等价费用估算。UI 不读取日志/DB；有 tokens 而费用为零时显示“暂无估价”。
- 主屏 scale 1.5：折叠 `{x:2504,y:588,width:56,height:216}`，展开 `{x:2184,y:428,width:376,height:536}`，右边界均为 2560。
- 副屏 scale 1：折叠 `{x:3584,y:828,width:56,height:216}`，展开 `{x:3264,y:668,width:376,height:536}`，右边界均为 3640。
- 两个真实 monitor 的选择回调均实测，窗口边界来自实际 BrowserWindow 与 screen API；Esc 折叠、托盘隐藏/恢复保留运行态通过。
- Win32 只读枚举确认 HUD 窗口可见、没有 caption、topmost=true。两条实际任务栏的 UIAutomation 与截图确认 HUD 无窗口按钮；临时关闭本验收窗口 skipTaskbar 后出现 `Electron - 1 running window` 按钮，恢复后消失，阳性对照通过。圆角区域显示/隐藏时桌面像素相同、中央像素不同，确认透明合成。
- 真实今日数与 `/api/summary?range=day&tool=codex` 的 tokens/sessions 一致。
- 点击“打开仪表盘”实际调用系统 `shell.openExternal`；停止本任务启动的服务后，按钮实际启动 checkout 的 Node CLI，HTTP 200、Edge 页面正常、0 pageerrors。
- Playwright Electron 验收脚本最后退出码 0。曾有控制器清理等待，测试所有者主动结束其控制器并修正 harness；没有改变产品退出行为或安全设置。
- 认证分支最终修复后 `pnpm.cmd build`：退出码 0；`pnpm.cmd test`：1,068 passed、1 upstream skipped、0 failed，117 core / 32 web / 42 widget / 839 CLI / 38 site。
- 最终代码上的原 dashboard/Codex/Claude/默认 widget 回归：退出码 0，HTTP 200、两 provider 非空记录、原 widget 可见并截图，0 pageerrors。
- 构建后源码、private runtime/evidence 与 Git staging 边界已检查。没有提交或上传日志、私有 DB、原始提示词/回复或凭据。
- HUD 实现 commit `a215492e6708a4c8e7371bccac5313a494c0eebe` 已推送到个人 origin。`git ls-remote` 验证开发分支与本地一致、main 仍为上游 `85b8687`，annotated `baseline-aiusage` 标签指向 `508aa09`。本状态文档的最终记录另作 docs commit；完整交付 HEAD 见 `git rev-parse HEAD` 和仓库外晨间报告。

## 限制与未完成

认证分支复审已修复并实测：页面标记 + 公开 auth/status + 401/UNAUTHORIZED 识别需认证 AIUsage，区分无服务、无关服务与可用服务。原 widget 连续打开两次、HUD 打开与手动重查均为 0 额外 spawn、0 安装、0 解析 POST，自动周期暂停；系统浏览器打开已有 `/overview` 登录页，Edge 实际显示密码框。测试未提交密码，未修改密码/CLI 配置，使用独立随机测试凭据与隔离 profile；截图和 JSON 在仓库外 auth-verification 文件中。harness 最初在启动请求未完成时测量流量，多读一次；校正测量起点后保留所有断言通过。HUD 不共享浏览器 cookie，密码保护启用时后台解析保持暂停，这是本轮的明确边界。

独立审查三项已修复：定时/手动刷新请求现有 CLI parse API；Santiago 午夜 DST 分别构造边界；Dashboard 验证页面与所需 API 契约后才打开。安全隔离的合成日志实测：CLI 没有刷新间隔，默认 60 秒自动由 100 到 300 tokens；点击刷新到 600，API 一致。3847 被真实测试 404 服务占用时，CLI 在 3848 启动且按钮打开 3848，原 404 服务未受影响。未向用户来源写入合成记录。单测新增 Santiago 与 HTTP/API 契约回归，完整 build/tests 和最终双屏/冷启动/原功能回归退出 0。原任务栏 harness 曾只匹配窗口标题而漏掉实际 Electron 分组名称，修正读法并用阳性对照验证；不是跳过失败或修改产品以迎合断言。

不做后续产品阶段：多设备 UI、Codex Home、Project Engine、Codex Launcher、AppBar、Unity/Unreal、自动启动、全屏隐藏、额外 hover 摘要。
未做安装包、Windows 热插拔实测、长时间稳定性测试。实际原始来源仍在被使用，历史缺失及模型价格缺失沿用上游限制。任务栏两屏当前配置已实测；其他 Windows/任务栏配置仍需验证。
验证数据保存在隔离的 `C:\AI-Tools\ai-dev-hud-runtime`，正常使用仍取用户 AIUsage 数据目录。两者不要混淆。操作未写入 `C:\AI-Tools\AI-usage-tracker`。

## 报告

Implemented: 仓库/fork/remotes、验证后基线/标签、独立 Windows 修复、文档、最小 HUD，以及追加的默认隐藏/边缘动画/穿透、原 Dashboard 明显中英切换与持久化；完整构建/测试和真实 Windows 验证。

Not completed: 后续阶段、安装包、热插拔与长时间测试。

Files changed: AGENTS.md、docs/{PRD,ARCHITECTURE,PROJECT_STATE,ROADMAP,WINDOWS_HUD}.md、widget hud-hover/main/hud-window/Hud.svelte 与测试、web LanguageSwitch/i18n/stores/layout 与页面文案/格式、i18n tests、Grok portable fixture；先前基线文件改动见提交历史。

Tests: 最终完整 build/test、HUD 双屏真实边缘鼠标/穿透/反向/焦点/状态、网页双语言/持久化/筛选/格式/移动端、两 provider 合成导入和原 widget、密码保护60秒暂停回归通过；先前真实 provider、刷新、端口冲突、任务栏/透明验收保留。原始失败和已有 skip 明确记录。

Three highest-priority manual tests:
1. 两屏不同缩放下靠近右缘中部，反复进入/离开并在收回中返回，确认平滑、穿透、不抢焦点；通过真实托盘菜单换屏。
2. 展开 HUD，启动 Codex 产生用量并和原 Dashboard 今日 Codex 数据对照；打开仪表盘、托盘暂停/恢复和 Esc。
3. 在 Dashboard 顶部切换中文/English，刷新并访问概览、图表、会话与设置；确认偏好/筛选保留，日期/币种/模型/项目路径正确。
