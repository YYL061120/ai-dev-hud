# 未知金额的真实链路修复（2026-10-04）

Implemented:
- 正式本机 API 在 7 天、30 天、累计周期出现 `gpt-6-astra`、`gpt-5.6-sol`、`gpt-5.6-terra` 费用未知，原因是已采集记录有 tokens，但本地注册表缺少这些精确模型的价格。新增三个有官方依据的精确条目；保留前一轮禁止任意前缀/日期套价的规则和用户价格优先级。
- 2026-10-04 核验标准短上下文 USD / 百万 tokens，顺序为输入、输出、缓存读、缓存写：Astra `10 / 50 / 1 / 12.5`；Sol `4 / 20 / 0.4 / 5`；Terra `2 / 12 / 0.2 / 2.5`。来源分别为 [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)、[Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)、[Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)。Sol 为官方当前促销价，页面说明至少持续至 2026-11-21。估算不是套餐账单，历史不保证复原当时价格，长上下文和服务档位可能改变实际费用。
- 继续使用已有本地记录投影，未重写原始日志或历史 DB；未知费用旁补充“缺少可核验费用或精确模型价格，未知不计为零”，提示只为已确认模型配置本地价格。未更改解析器、额度 TTL、切号失效或用户 Claude 配置。

Not completed:
- 用户截图尚未读取成功。使用 Library 官方 materialization helper 后，Windows 在 `os.setxattr` 写元数据时报错；目标文件未存在，未绕过 helper，也未查看/上传截图。因此本轮已修复项来自真实 API，不能声称与截图所指位置完全吻合。
- `codex-auto-review` 无已核验公开价格；`cursor-composer` 未标具体版本，不能推定相应单价。保留未知。不能借一个模型的价格代替另一个标签。
- Claude 正式 API 仍为 `waiting-response`、没有套餐窗口；此前用户启用配置保持原样。需要用户自己在交互终端运行 `claude` 并完成正常响应，才可能由官方 statusline 产生观测；未代发消息，也未重复启用。未验证真实 Claude 套餐捕获。
- 未用物理鼠标目视验收常驻 Electron，未进行 Mac 实机测试。
- 修复保存于本地提交 `746f61a`。自动审批拒绝向现有 GitHub remote 推送，理由是未确认对该具体外部目的地的源码/文档披露授权；未绕过限制。推送仍待明确目的地授权，本机正式修复已生效。

Files changed:
- `packages/core/src/pricing.ts`：三个精确官方价格。
- `packages/cli/tests/commands/curated-prices.test.ts`：精确单价、未知标签/任意后缀、用户覆盖回归。
- `packages/web/src/lib/components/UsageToolDetails.svelte`：未知金额原因提示。
- 本说明及 `PROJECT_STATE.md`。

Tests:
- `pnpm.cmd build` 成功；`pnpm.cmd test`：1182 passed、1 个既有 skipped、0 failed，133 files。没有增加跳过。
- 正式 `127.0.0.1:3847` 只读 API 验收：三个模型在所有存在记录的周期均有费用且 `missingEstimates=0`；剩余上述无可核验价格标签保持未知。Claude 状态仍为等待终端输入。
- 正式 `/local-usage` 用真实 API 的浏览器无头验收：7 天三个模型显示美元费用，未知标签不显示零金额，原因文字显示，Claude 等待说明存在，0 page errors。不保存真实截图或私人数据。
- 隔离合成数据 `verify-hud-hover.cjs` 四组普通/1.5 缩放及减少动画回归通过。正常恢复正式 API PID 80816、HUD PID 14844，用户 Claude settings/widget settings 哈希不变。其他端口 CLI 和模型进程未重启。

Three highest-priority manual tests:
1. 在 HUD 和本地用量页切换 7 天、30 天、累计，确认三个已知模型费用显示、未知标签原因可读。
2. 用户在交互终端自行运行 `claude` 并完成正常响应，随后查看 HUD 与官方 `/usage`；无需重新启用接入。
3. 用真实鼠标检查右边缘唤起、连续移动及关闭后的点击穿透，确认动画和主屏偏好保持。
