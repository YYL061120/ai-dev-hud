# Claude 清除与失效传播修复（2026-10-04）

旧版恢复提示修复：返回 missing-progress-boundary，明确原会话不能自动恢复，指引开启新的 Claude Code 会话，或本地用量 → Claude 本地额度接入 → 预览停用并恢复 → 确认停用并恢复 → 预览启用 → 确认启用。保守边界不变；真实用户配置未改。最终 build 通过，1175 passed / 1 既有 skip / 0 failed，133 files；生产中英提示与三种即时撤销回归通过。独立审查的 Electron 连接超时，只有实现方此前的隔离原生测试通过，未完成全部独立原生验收。

修复 `dd7e437` 独立审查的两项 P2。本次没有扩展产品功能，也没有替用户启用 Claude 或改动用户 Claude 配置。

Implemented:
- 每会话保存官方累计 API 响应时长的非负数字进度，作为保守的响应顺序边界；不保存 cost 原对象或任何原始 payload。低于进度边界的输入不能回退到旧百分比。清除后的会话必须提供严格大于边界的响应进度；缺少进度或旧版本没有进度时保持未知。这个数字仅判断响应顺序，不计算金额、套餐比例或账号归属。
- 清除保留被阻断的会话边界，超过 30 秒也不删除；新响应超过边界后解除。仍最多 16 个会话槽位；槽位满而无法安全识别新会话时保持未知，不删除清除边界来换取可见额度。既有哈希黑名单只作补充，历史重放阻断不依赖有限指纹列表覆盖每一响应。
- Web 清除、暂停、确认停用成功后同步撤销所有周期中的 Claude subscription/generation，再刷新；保留设备 tokens 和 Codex 数据。操作代际阻止进行中的旧请求重新发布 Claude 额度。
- CLI 在管理操作成功后写入仅含随机代际的本地 `claude-quota-invalidation.json`。Widget 主进程的适配器每 100 ms 观察文件元数据，撤销 Claude 并推送 typed snapshot，随后刷新。UI 不读配置、DB 或观测文件；后台旧请求同样不能回填。此信号不触发云、凭据或日志采集。

Not completed:
文件观察受 OS 调度影响，不保证跨进程零毫秒传播；真实 Electron 回归要求在 2.5 秒内撤销，通过后再进入原生边界测试。物理鼠标、真实 Claude 订阅响应仍需用户人工验证。缺少响应进度时宁可保持未知，不假定输入属于新响应。

Files changed:
CLI 会话观测与管理信号、core 按工具失效 API、Web 接入回调与读取代际、Widget 信号适配器和读取代际；单元测试及三个生产回归脚本；状态和交接文档。

Tests:
- 全量 `pnpm.cmd build` 通过；`pnpm.cmd test` 1174 passed / 1 既有 skip / 0 failed，133 files。首次 Widget 构建发现 CommonJS/ESM 模块边界，已修正并清理本次意外生成的五份未跟踪编译文件，完整重建与测试通过。
- 单元回归与固定 SHA 脚本覆盖 A35→B50→clear→A35、缺失进度、会话过期后边界保留，以及后续更大进度恢复。
- 实际构建 CLI/Web 隔离 E2E 清除后不点击刷新，立即撤销环，重放较早输入不能恢复；原 statusline 输出与恢复、配置冲突仍通过，实际用户设置未变。
- 合成 API 的生产 Web 三组 clear/disable/pause：在故意延迟一秒的 usage 响应返回前撤销，tokens 1234 保留，0 page errors。
- 隔离真实 Electron 三组 clear/disable/pause：2.5 秒内撤销，tokens 保留；随后实际 150% 主屏、100% 副屏原生边界两组通过，0 page errors。未发送物理桌面输入。
- 本机证据：`C:\AI-Tools\ai-dev-hud-evidence\claude-p2`。仅合成数据和脱敏结果，未上传截图或私人数据。

Three highest-priority manual tests:
1. 显示新响应额度后清除，再重放较早响应，确认 Web/HUD 均保持未知；下一次更大响应进度可恢复。
2. 清除、暂停、停用时观察 Web 立即撤销、HUD 随本地信号撤销，tokens 和 Codex 环保留；后台请求不能回填旧 Claude 环。
3. 两块屏幕保持既有动效和边缘交互，对照真实 Claude `/usage` 核验新观测及 reset；缺少进度明确未知。
