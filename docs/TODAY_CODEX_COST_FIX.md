# 今日 Codex API 等价金额修复（2026-10-04 UTC）

独立复核 P2：删除任意模型前缀套价；精确模型、已登记 alias/date 及用户显式价格/绑定仍有效，未发布后缀和未来日期保持未知。保留既有 Site 使用的一个历史日期 `claude-sonnet-4-20250514`，2026-10-04 对照 [Anthropic 官方历史模型清单](https://platform.claude.com/docs/en/about-claude/model-deprecations) 核验；不推导其他日期。core、CLI 读取和价格管理视图一致。完整 build 通过，最终 1181 passed / 1 既有 skip / 0 failed，133 files；正常 CLI 重载53052，HUD50644保持，今日已知金额不变。cache-write 只保留兼容/估算声明。

Implemented:
- 真实本机时区为 America/Los_Angeles；今日 API since/until 与本机日历午夜一致，HUD 按 today 读取，没有错取 seven。今日 12 条 token_count 白名单事件与 DB 数量及输入/输出/缓存汇总一致；后来文件修改时间不代表新 token 事件，正常刷新返回 0 新记录，不能据此宣称采集遗漏。
- 今日主要模型 gpt-6.1-sol 缺价格却被 Codex parser 标成 pricing/$0。补充该模型明确的官方标准短上下文价：每百万输入 $2、缓存读 $0.10、缓存写 $2.50、输出 $10；2026-10-04 核验，来源 https://developers.openai.com/api/docs/models/gpt-6.1-sol 。不通配其他模型，不从订阅额度反算金额。
- 复用 parser，仅修正价格存在性并兼容本地日志的 cache_write_input_tokens 字段，保留原始 inclusive input/output 及解析身份语义。这个兼容字段不等同官方 API input_tokens_details.cache_write_tokens；本机事件中字段存在且值为零，不构成已验证官方 Codex cache-write 来源/计数语义的证据。金额继续是估算。单独计费适配扣除输入内的缓存读/写；reasoning 已包含在 output，计费不再重复相加。CLI/API 重算使用相同适配。
- 本地 typed usage 投影重新估算本机历史 Codex 非 log 记录，旧 priced zero 可立即恢复；不改原始 DB 记录、不重估导入设备、不改 metadata 导出或记录版本。未知价格为 null/未知，保留部分金额标记。
- 正式 API 的今日 gpt-6.1-sol：输入 408137、缓存读 369024、输出 2441、已捕获缓存写 0；(408137−369024)×2/百万 + 369024×0.10/百万 + 2441×10/百万 = $0.1395384。生产页面实际显示约 $0.1395，codex-auto-review 为未知。这里只是必要脱敏汇总，不保存来源、项目、会话正文或凭据。

Not completed:
- 金额为当前已知标准短上下文 API 价估算，不是订阅账单或额度扣款；长上下文、Fast 档位、历史费率及旧日志缺失字段无法从现有记录精确重建。未为其他模型猜价。
- 本轮保留既有 token 展示口径，计费单独使用 inclusive counters；未改变传输 schema 或历史导入的金额。
- 常驻 HUD 已按正常 launcher 恢复，但本轮没有工具入口读取实际常驻 Electron DOM 或进行物理鼠标验收，不能把生产 Web 实测冒称桌面目视验证。

Files changed:
core pricing/Codex parser；CLI local usage 投影、CLI/API 重算；Codex 与 local-usage 回归；UsageToolDetails 估算说明；本文和 PROJECT_STATE。

Tests:
- 完整 pnpm.cmd build 通过，Electron SQLite binding verified，shared Node binding unchanged。
- 完整 pnpm.cmd test：1178 passed / 1 既有 skip / 0 failed，133 files。最初回归先发现旧 token fixture 口径不符，撤回不属于本轮金额范围的展示口径改动；CLI 随后读到旧 core dist，完整重建后重跑通过，未新增 skip。
- 新回归核验 inclusive cache/reasoning、$0.0196 缓存写例子、未知模型、历史投影不改 DB、导入金额保持。既有大历史 WAL/去重/取消用例通过。
- 正式 3847 API、真实数据的生产 Web 今日切换/金额/未知值通过，0 page errors。第一次 UI 验收未等待 today 请求返回，保留金额断言、等待真实切换响应后复跑通过。
- 正式 HUD PID 50644、服务 PID 54772；只重启经身份核验的本仓库 34084/20388，未停止 Claude/Codex 或另外两份已存在服务。Claude settings 与 widget-settings 哈希不变，preferredDisplay 1220717916 保留。

Three highest-priority manual tests:
1. 真实 HUD 切到今日，核对 gpt-6.1-sol 显示约 $0.1395、未知模型保持未知，工具合计标注部分估算；再切 7 天验证周期独立。
2. 用户自己完成下一次 Codex 正常工作后刷新，核对同周期 typed API 与模型金额一起更新；不靠 quota 百分比计算金额。
3. 主屏右边缘展开/收回、跨圈和详情、主副屏偏好及物理穿透继续沿用既有验收。
