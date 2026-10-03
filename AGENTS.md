# AI Dev HUD — 编码代理工作约定

## 当前范围

本地大历史补齐已完成。保持用户确认的 HUD 行为和现有 Dashboard 布局；停止新增功能，等待用户决定真实同步采用自有目录还是云方案。本批只实现 version 1 分块/有界导入去重/进度/取消/失败反馈和官方最近会话接口的只读可行性检查；不得自行启动同步或 Codex daemon。后续仅在明确授权下继续，禁止设备身份自动合并、视觉重设计或扩展引擎集成。

## 必须遵守

- **绝不直接在 main 开发。** 当前分支为 `feat/local-control-center`，来自已验证 HUD 分支。
- 修改前先阅读实际实现、相关测试和本文件。
- 重大架构修改前先提出计划；无法从需求安全解决的重大歧义须交给用户。
- 优先复用 AIUsage；不要重写已工作的 Codex/Claude provider parser。
- UI 只能消费有类型的领域 API；不在 UI 解析日志或打开数据库。
- provider parsing、usage domain、storage、sync、presentation 分开；使用适配器或扩展，保持同步后端可替换。
- 只做当前明确追加的本地里程碑；禁止 AppBar、Unity/Unreal 集成、默认云上传与未经授权的全盘项目扫描。
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
