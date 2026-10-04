# Claude 已启用但无更新：真实本机诊断（2026-10-04 UTC）

Implemented:
- 核验 feat/local-control-center / c2d446c 起点和干净工作区；无 .agents/skills 目录。没有修改 AI-usage-tracker。
- 用户已在 02:20:14 UTC 启用真实接入；用户 settings 的 statusLine 与托管字段一致，正式 /api/local/claude/statusline 返回 enabled=true、conflict=false、canRestore=true。Node/CLI/wrapper 路径均存在，wrapper 语法检查通过。未重新启用、停用、清除或覆盖配置。
- ~/.aiusage 下没有 claude-session-observations.json；正式 usage 的 Claude reason=waiting-response，没有输入可判断 rate_limits 内容。不是 missing-progress-boundary，也没有已采集数据被 30 秒 TTL 撤销的证据。
- 实际 CLI 命令版本为 2.1.284；运行的 Code 后台来自 Claude 桌面应用，版本路径 2.1.286，父进程为桌面应用，包含 --print/流式输入输出标志。没有交互终端 Claude 进程证据。结合官方 statusline 的终端渲染机制，推断这些后台会话没有执行 wrapper，这是现有证据最吻合的原因；不能保证所有 Desktop/IDE 模式都如此。来源 https://code.claude.com/docs/en/statusline 。
- UI 明确“已启用表示配置已保存”，说明交互终端 statusline 要求和无需重复启用；waiting-response 不再泛泛要求再启用。保留清除边界、切号失效、30 秒有效期和原有动画。

Not completed:
- 未触发用户真实 Claude 正常响应，未证实真实 rate_limits 字段或订阅窗口；没有打开新会话、发送模型消息、读取认证 token/密码/完整对话。只读取设置中的 statusLine、受控备份字段及必要进程布尔标记。
- 当前工作区未发现项目 .claude 配置；桌面后台其他工程的实际 cwd/项目覆盖未获得足够只读证据，未全盘扫描用户工程。
- 30 秒 TTL 加正常响应触发确实会令空闲时经常未知；HUD 每 15 秒读取，合法弧可能只显示约 15–30 秒。本次问题发生于首次输入之前，因此未用延长 TTL 掩盖根因。独立的“最后观测值/过期淡化”可以后续明确设计，但须与当前有效额度分离、保持切号/清除撤销，不能仅缓存旧百分比冒充实时。

Files changed:
ClaudeIntegration.svelte、UsageToolDetails.svelte；本文、PROJECT_STATE。

Tests:
- 完整 build 与 1178 passed / 1 既有 skip / 0 failed（133 files）通过。
- 隔离 HOME/config 的真实生产 CLI/Web E2E 通过：原 stdout 保留、清除阻断旧输入、新进度恢复、多会话未知、过期、恢复及配置冲突，真实用户 settings 哈希不变，0 page errors。这是合成验证，不是用户真实额度已恢复。
- 正式 API 与真实生产 Web 实测等待输入说明、终端说明、已启用按钮禁用，0 page errors。恢复新正式进程后 settings/主屏偏好哈希不变，真实观测文件仍不存在。

Three highest-priority manual tests:
1. 无需再次启用：用户在自己的交互式终端运行 claude，确认底部出现 Claude Code statusline；自行完成下一次正常响应，立即查看 HUD 并对照 /usage。
2. 若底部 statusline 未出现，核查该终端使用的配置目录及项目 statusLine 覆盖；若底部出现但 HUD 仍未知，报告具体模式与时间，再只读检查白名单捕获原因，勿先清除/重装。
3. 真实响应后检验 30 秒失效、切号清除和多会话未知；保留原渲染、主屏偏好、右边缘动画及物理穿透。
