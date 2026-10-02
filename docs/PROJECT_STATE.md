# 项目状态

更新：2026-10-02。当前里程碑：Phase 0 → Phase 1 Windows HUD MVP。后续阶段禁止提前实现。

## 仓库

- 目录：`C:\AI-Tools\ai-dev-hud`
- origin：`https://github.com/YYL061120/ai-dev-hud.git`
- upstream：`https://github.com/juliantanx/aiusage.git`
- 个人仓库经 GitHub API 确认是 fork，parent 为 juliantanx/aiusage。
- 上游基线：`85b86874f579f4627456de89b102f016d489ce27`（1.5.19）。远端与本地 main 一致。
- 开发分支：`feat/windows-hud-mvp`；main 保持上游。
- GH CLI 未登录，GitHub connector 已认证 YYL061120。最终 Git push 尚未验证。

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

## 交付与门禁

AGENTS.md、PRD、ARCHITECTURE、ROADMAP 已建立。尚未进行 HUD 产品代码修改。
Phase 0 门禁已通过；已在 ARCHITECTURE.md 记录实现计划，可进入 Phase 1。
证据目录：`C:\AI-Tools\ai-dev-hud-evidence`。私人日志内容、DB、截图不得进入提交。

## 报告

Implemented: 仓库确认、依赖、开发分支、Windows 基线修复与文档。

Not completed: HUD、最终验证与远端 push。

Files changed: AGENTS.md、docs/{PRD,ARCHITECTURE,PROJECT_STATE,ROADMAP}.md、widget package/build helper、Cursor fixture。

Tests: 安装、修复后 build/test、原 dashboard/provider/widget 实测通过，原始失败已记录。

Three highest-priority manual tests:
1. 原 AIUsage dashboard 的 Codex/Claude 数据。
2. HUD 折叠/展开向左并贴显示器右侧。
3. Open Dashboard 与原 widget 保持可用。
