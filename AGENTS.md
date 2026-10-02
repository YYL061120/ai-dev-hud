# AI Dev HUD — 编码代理工作约定

## 当前范围

本轮完成 Phase 0 和 Phase 1，以及用户明确追加的 HUD 边缘悬停滑入/收回、原 Dashboard 中英文可见切换。追加两项分别提交并通过验证后停止；其他后续功能只可记入路线图。

## 必须遵守

- **绝不直接在 main 开发。** 当前分支为 `feat/windows-hud-mvp`。
- 修改前先阅读实际实现、相关测试和本文件。
- 重大架构修改前先提出计划；无法从需求安全解决的重大歧义须交给用户。
- 优先复用 AIUsage；不要重写已工作的 Codex/Claude provider parser。
- UI 只能消费有类型的领域 API；不在 UI 解析日志或打开数据库。
- provider parsing、usage domain、storage、sync、presentation 分开；使用适配器或扩展，保持同步后端可替换。
- 只做当前里程碑；禁止提前实现多设备 UI、Codex Home、Project Engine、Launcher、AppBar、Unity/Unreal 集成。
- 有意义的工作后更新 `docs/PROJECT_STATE.md`，区分实测、推断、未测与阻塞。
- 声称完成前运行相关构建和测试，不忽略失败，不添加跳过来伪造健康基线。
- 遇到需用户完成的认证、不可逆/破坏性操作或重大不可解架构歧义，暂停对应操作并继续独立安全工作。
- 不 force push，不改写历史。保留上游许可证、来源与解析语义。
- **不得修改 `C:\AI-Tools\AI-usage-tracker`。** 不提交或上传原始日志、提示词、回复、源码采集、私人 usage DB 或凭据。
- 默认本地运行；同步与 leaderboard 上传均不默认启用。
- 后续流程、说明与工作文档使用中文，代码标识符与命令保留原样。

## 命令与证据

Windows 使用 `pnpm.cmd` / `npm.cmd`，不要为了脚本而降低执行策略。`packageManager` 固定 `pnpm@9.15.0`。

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
pnpm.cmd test
node packages/cli/dist/index.js serve
```

当沙箱身份和文件所有者不同，只使用本仓库的 `git -c safe.directory=C:/AI-Tools/ai-dev-hud ...`，不要关闭全局安全检查。
本机证据在 `C:\AI-Tools\ai-dev-hud-evidence`；私人运行数据在仓库外，不进入 Git。

## 每份有意义的实现报告

必须包含以下项目（可在英文标识后用中文叙述）：

Implemented:
...

Not completed:
...

Files changed:
...

Tests:
...

Three highest-priority manual tests:
1. ...
2. ...
3. ...
