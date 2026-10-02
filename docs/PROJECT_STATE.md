# 项目状态

更新：2026-10-02。当前里程碑：Phase 0 → Phase 1 Windows HUD MVP。后续阶段禁止提前实现。

## 仓库

- 目录：`C:\AI-Tools\ai-dev-hud`
- origin：`https://github.com/YYL061120/ai-dev-hud.git`
- upstream：`https://github.com/juliantanx/aiusage.git`
- 个人仓库经 GitHub API 确认是 fork，parent 为 juliantanx/aiusage。
- 上游基线：`85b86874f579f4627456de89b102f016d489ce27`（1.5.19）。远端与本地 main 一致。
- 开发分支：`feat/windows-hud-mvp`；main 保持上游。本轮工作仅限 Phase 0 / Phase 1，已到停止条件。
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
- Win32 只读 style 检查：没有 caption，topmost=true。`skipTaskbar=true` 为源代码配置证据，任务栏图标是否隐藏未单独视觉验证；不能用 WS_EX_TOOLWINDOW 位冒充这项验证。
- 真实今日数与 `/api/summary?range=day&tool=codex` 的 tokens/sessions 一致。
- 点击“打开仪表盘”实际调用系统 `shell.openExternal`；停止本任务启动的服务后，按钮实际启动 checkout 的 Node CLI，HTTP 200、Edge 页面正常、0 pageerrors。
- Playwright Electron 验收脚本最后退出码 0。曾有控制器清理等待，测试所有者主动结束其控制器并修正 harness；没有改变产品退出行为或安全设置。
- 最终 `pnpm.cmd build`：退出码 0；最终 `pnpm.cmd test`：1,056 passed、1 upstream skipped、0 failed，117 core / 32 web / 30 widget / 839 CLI / 38 site。
- 最终代码上的原 dashboard/Codex/Claude/默认 widget 回归：退出码 0，HTTP 200、两 provider 非空记录、原 widget 可见并截图，0 pageerrors。
- 构建后源码、private runtime/evidence 与 Git staging 边界已检查。没有提交或上传日志、私有 DB、原始提示词/回复或凭据。
- HUD 实现 commit `a215492e6708a4c8e7371bccac5313a494c0eebe` 已推送到个人 origin。`git ls-remote` 验证开发分支与本地一致、main 仍为上游 `85b8687`，annotated `baseline-aiusage` 标签指向 `508aa09`。本状态文档的最终记录另作 docs commit；完整交付 HEAD 见 `git rev-parse HEAD` 和仓库外晨间报告。

## 限制与未完成

不做后续产品阶段：多设备 UI、Codex Home、Project Engine、Codex Launcher、AppBar、Unity/Unreal、自动启动、全屏隐藏、hover peek。
未做安装包、Windows 热插拔实测、长时间稳定性测试；任务栏图标需手测。实际原始来源仍在被使用，历史缺失及模型价格缺失沿用上游限制。
验证数据保存在隔离的 `C:\AI-Tools\ai-dev-hud-runtime`，正常使用仍取用户 AIUsage 数据目录。两者不要混淆。操作未写入 `C:\AI-Tools\AI-usage-tracker`。

## 报告

Implemented: 仓库/fork/remotes、验证后基线/标签、独立 Windows 修复、文档、最小 HUD、完整构建/测试和真实 Windows 验证。

Not completed: 后续阶段、安装包、热插拔与长时间测试、任务栏视觉确认。

Files changed: AGENTS.md、docs/{PRD,ARCHITECTURE,PROJECT_STATE,ROADMAP,WINDOWS_HUD}.md、root package/test isolation runner、widget main/preload/launcher、HUD data/window/renderer、native helpers、HUD tests、Cursor fixture。

Tests: 安装、最终 build/test、HUD 双屏/UI/API/cold launch、原 dashboard/provider/widget 回归均通过；原始失败和已存在的 skip 明确记录。

Three highest-priority manual tests:
1. 两屏不同缩放下，使用真实托盘菜单切换，确认折叠/展开与贴边。
2. 启动 Codex 产生用量，与原 dashboard 的今日 Codex 汇总对比，注意“暂无估价”含义。
3. 确认任务栏没有 HUD 图标、窗口置顶，点击打开仪表盘并测原 widget；隐藏/恢复和 Esc。
