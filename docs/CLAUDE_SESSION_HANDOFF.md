# Claude 当前会话套餐观测交接（2026-10-04）

清除与即时失效传播以 [CLAUDE_CLEAR_FIX.md](CLAUDE_CLEAR_FIX.md) 为准。

本轮在保留同心环、原有动画与独立详情的基础上，补齐明确启用的本地 Claude statusline 接入。Codex 的账号短时核验沿用已有实现；关闭与刷新失败修复单独提交为 `ecc3fa8c9bdcf077f922981b0c37e8a946cf58af`。本文更新此前“Claude 永远未知”的阶段结论。

Implemented:
- 本地用量页新增默认折叠的 Claude 接入区：预览、取消、明确确认、清除观测、停用并恢复。预览不写配置；确认必须匹配两分钟内的预览和配置版本。
- 仅在用户明确确认后组合用户级 `statusLine`：保存原字段并转发原始 stdin、stdout、stderr，保留空格路径、Unicode 和原渲染。备份只含原 statusLine，不复制其他配置字段。超过 256 KiB 的输入仍转发原渲染，停止本次额度采集。
- 官方 `rate_limits.five_hour / seven_day` 通过现有 normalizer 进入 typed domain。橙色环表示当前会话观测的真实官方窗口百分比，明确“账号未核验”；不当作设备独享额度，不使用 token、API 费用、上下文或网关余额替代订阅额度。
- 观测有效期最多 30 秒且不超过 reset；重复相同窗口及响应进度不会延长额度 TTL。并发会话、缺少会话/窗口、清除、过期、配置冲突均回退未知，提供 `/usage` 和官方 usage 页面出口。
- 会话标识仅保存 SHA256；响应进度另保留非负数字元数据作为清除边界；不保存 cost 对象或原始输入。观测仅保存窗口、随机代际和时间，不保存原输入、提示词、回复、账号标识或凭据。活跃会话最多 16 条，失活回收；清除指纹最多保留 64 对，阻止清除后的已知旧输入重新发布。
- SQLite OS 文件锁序列化本地修改与采集，进程退出自动释放。检测外部配置改动后拒绝覆盖；冲突时可仅停止采集而不改 Claude 配置，保留原备份供人工恢复。暂停后的托管 wrapper 不会被再次套入自身。

Not completed:
- 没有替用户启用，也没有修改用户真实 Claude settings。尚未验证用户真实 Pro/Max 会话返回的百分比；合成官方输入的实际 CLI、原渲染和生产 UI 已验证。
- Claude 全局账号归属未核验；切换账号后尚无新的 statusline 信号时，旧观测最多残留 30 秒，再加 UI 每秒检查的调度误差。请先清除观测，新的正常响应后再查看；不承诺瞬时账号一致。
- 项目级覆盖、所有复杂原 shell 命令及物理鼠标穿透尚需人工验证。测试覆盖本机 Git Bash 和带空格命令，不代表所有 shell 语义均已实测。外部编辑器不遵守本应用锁；确认时请勿同时修改配置，文件系统没有针对任意编辑器的原子 compare-and-swap。
- 用户参考图的官方 Library materialization 在 Windows `os.setxattr` 失败，一次明确本机重试后目标仍不存在；未绕过 helper，也未声称看过原图。新合成截图仅保存在本机，无上传。

Files changed:
core Claude 接入 DTO / subscription scope；CLI 接入 manager、会话观测、OS mutex、statusline 命令和受现有 loopback 安全边界保护的 API；Web 折叠接入区与工具详情；单元测试、生产 E2E、固定 Git SHA 审查脚本；本交接与状态、架构、方案文档。

Tests:
- `pnpm.cmd build` exit 0，Node / Electron SQLite binding 各自验证且互不替换。
- `pnpm.cmd test`：1173 passed / 1 既有 skip / 0 failed，133 files。首次失败来自测试注入未来响应时间后在现在清除；修正模拟时间顺序后完整重跑通过，没有新增 skip。
- 隔离 HOME / config 的生产 CLI + Web E2E：预览取消、拒绝确认、组合原输出、当前会话 UI、清除后重复输入、后续新响应、过期、多会话、恢复、外部编辑拒绝和安全暂停全部通过，实际用户 settings 哈希不变，0 page errors。
- Web / HUD 的 401、503、网络失败六组：立即撤销套餐环、保留历史 token，0 page errors。同心环脚本覆盖五工具、多设备、周期与额度窗口独立、费用缺失不是零、独立 panel 和 reduced-motion。
- 固定 SHA 审查使用 `git show <40位SHA>` 的源码而非漂移工作区，覆盖两传输正常关闭之前不发布、同批注销/异常关闭、多进程锁、旧数据时序及托管 Claude 流程。最终 SHA 与本机产物检查见本机证据。
- 证据目录：`C:\AI-Tools\ai-dev-hud-evidence\claude-session`；旧 Codex / proxy 修复证据：`C:\AI-Tools\ai-dev-hud-evidence\subscription-rings`。均为本机；不提交 DB、原日志或真实截图。

Three highest-priority manual tests:
1. 在本地用量页展开 Claude 接入，先预览原配置，再明确确认；在 Claude Code 完成正常响应后确认橙色环及“当前会话观测·账号未核验”，对照 `/usage`，分别核对统计周期和额度 reset。
2. 清除或切号后确认未知；新响应恢复，两个同时活跃会话仍未知；停用后原 statusline 输出恢复。外部改配置时确认拒绝覆盖，并用安全暂停停止采集。
3. 150% 主屏及 100% 副屏使用真实鼠标跨缝、反向和滚动；核对 32 DIP / 140 ms、向左展开、外侧 8 DIP 点击穿透及焦点不被抢。自动化指针注入不能替代物理验证。

最小用户动作：本地用量页 → Claude 接入 → 预览启用 → 确认；随后在 Claude Code 正常完成一次响应。官方文档说明订阅窗口通常只在 Pro/Max 且已有 API 响应后出现，未出现时诚实未知，不触发额外模型请求。

官方依据：[Statusline rate-limit usage](https://code.claude.com/docs/en/statusline#rate-limit-usage)，[Claude usage](https://claude.ai/settings/usage)。
