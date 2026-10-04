# 项目状态

## 2026-10-04 真实未知金额追加修复

Implemented: 本机 API 证实三个精确 GPT 模型缺少价格，已补官方标准短上下文价格；未知费用补充可读原因。正式页面及 API 均已验证三个模型费用恢复，未改用户 Claude 配置或 quota 安全语义。详见 [未知金额修复](UNKNOWN_MODEL_COST_FIX.md)。

Not completed: Library 截图下载在 Windows 元数据写入时失败，目标未落地，未看图，不能确认截图所指项目；codex-auto-review / 未标版本 cursor-composer 无可核验价格，保留未知。Claude 仍 waiting-response；需要用户自己完成交互终端正常响应。未进行常驻 Electron 物理鼠标或 Mac 实机验收。

Files changed: core pricing、CLI curated-prices 回归、共用 UsageToolDetails 未知原因、本文及 UNKNOWN_MODEL_COST_FIX。

Tests: build 成功；1182 passed / 1 既有 skip / 0 failed，133 files。真实 API 全周期验收，正式 Web 7 天费用及原因渲染通过，0 page errors；隔离 HUD hover 四组通过。正式 API80816 / HUD14844 已恢复，Claude/widget 设置哈希不变；未上传私人截图或运行数据。

Three highest-priority manual tests:
1. HUD 和本地页切换 7 天/30 天/累计，核对已知模型金额及剩余未知说明。
2. 用户自己在交互终端运行 claude 并完成响应，比较 HUD 与 /usage；不要重复启用。
3. 物理鼠标验证右边缘唤起、连续移动和关闭穿透。

---

## 2026-10-04 独立复核 P2 补修（当前最新）

Implemented: 价格只匹配精确模型、明确登记的 alias/date 与用户显式价格/绑定；删除 core 和 CLI 价格管理视图的任意 startsWith 套价。gpt-6.1-sol-unpublished、gpt-6.1-sol-20990101 均保持未知；保留官方核验的历史 claude-sonnet-4-20250514 日期白名单，不生成其他日期。Codex cache_write_input_tokens 只描述为本地日志兼容字段，不宣称等同官方 API 或已验证官方 Codex 来源。

Not completed: 真实 Claude 仍 waiting-response，未代发消息或改接入；其他日期/新别名须有明确登记，不能自动继承价格。

Files changed: core pricing、Codex 注释；CLI pricing-registry；价格匹配/绑定回归及合成价格 fixture；TODAY_CODEX_COST_FIX 与本页。

Tests: 完整 build 通过；1181 passed / 1 既有 skip / 0 failed，133 files。首次发现 Site 历史日期与 CLI 模型归属 fixture 曾依赖任意前缀；官方核验日期后加入明确白名单，合成归属 fixture 明确注册价格，保留归属/金额断言，未跳过测试。实际构建的未发布/未来日期负例均未知；正式 today 金额仍 $0.1395384。仅重载正式 CLI 为53052，HUD50644保持，Claude仍等待真实输入。

Three highest-priority manual tests:
1. 未发布后缀/未来日期在价格管理与用量详情都显示未知。
2. 用户明确绑定或填写该精确模型价格后，价格按显式配置显示。
3. 今日 Codex 已知金额、Claude 等待输入提示和原 HUD 行为保持；不替用户发送响应。

---

## 2026-10-04 真实故障修复

Implemented: 今日 Codex gpt-6.1-sol 缺价却显示 priced zero 已修，inclusive cache/reasoning 单独计费适配；生产 API 与生产 Web 今日金额 $0.1395384（显示约 $0.1395），auto-review 金额未知。Claude 已启用配置真实核验，尚无 statusline 捕获；桌面后台流式会话与终端接入不匹配是证据最吻合的推断，补齐无需重复启用及终端说明。见 [金额实测报告](TODAY_CODEX_COST_FIX.md)、[Claude 实测诊断](CLAUDE_LIVE_DIAGNOSIS.md)。

Not completed: 用户真实 Claude 额度未验，未发送消息或更改接入；30 秒 TTL 不延长，历史值淡化尚未实现。常驻 Electron 目视和物理鼠标未测。Mac 后台说明只读核验仓库，未实机验证或实现自动传输，见 [现有设备传输](LOCAL_DEVICE_TRANSFER.md)。

Files changed: core pricing/Codex parser、CLI local usage 与重算、两组回归、共用详情与 Claude 接入说明、三份报告。

Tests: 全量 build 通过；1178 passed / 1 既有 skip / 0 failed，133 files；隔离生产 Claude E2E 与真实本机 production Web/API 通过，0 page errors。正式 HUD50644/CLI54772 已恢复，Claude/widget 设置哈希不变，主屏偏好1220717916保留；未停止 Claude/Codex 或其他两份 CLI。

Three highest-priority manual tests:
1. 用户交互终端运行 claude，自行完成正常响应，立即对照 HUD 与 /usage；无需再次启用。
2. HUD 今日 Codex 金额约 $0.1395、未知模型与部分估算；下一次正常工作后核对 typed API 更新。
3. 主屏/副屏、右边缘动效、详情与物理穿透回归。

---

旧版恢复提示修复：返回 missing-progress-boundary，明确原会话不能自动恢复，指引开启新的 Claude Code 会话，或本地用量 → Claude 本地额度接入 → 预览停用并恢复 → 确认停用并恢复 → 预览启用 → 确认启用。保守边界不变；真实用户配置未改。最终 build 通过，1175 passed / 1 既有 skip / 0 failed，133 files；生产中英提示与三种即时撤销回归通过。独立审查的 Electron 连接超时，只有实现方此前的隔离原生测试通过，未完成全部独立原生验收。

最新修复：[CLAUDE_CLEAR_FIX.md](CLAUDE_CLEAR_FIX.md)。清除以每会话响应进度边界阻断较早输入；Web/HUD 管理操作同步撤销 Claude，tokens 保留，进行中的旧读取不能回填。build 通过，1174 passed / 1 既有 skip / 0 failed；生产 Web 三组、隔离 Electron 三组及原生双屏回归通过，实际用户 Claude 未启用。

2026-10-04 当前交付：[CLAUDE_SESSION_HANDOFF.md](CLAUDE_SESSION_HANDOFF.md)。Claude 明确启用的原 statusline 组合、当前会话 30 秒观测、未知原因、清除与冲突暂停已完成；没有替用户启用，真实订阅百分比待用户正常响应验证。全量 build exit 0；tests 1173 passed / 1 既有 skip / 0 failed，133 files。关闭与刷新失败修复独立提交 ecc3fa8。以下历史“Claude 永远未知”结论已由此阶段更新。

2026-10-04 优先修复记录：[QUOTA_CLOSE_FAILURE_FIX.md](QUOTA_CLOSE_FAILURE_FIX.md)。proxy/stdin 全部等待正常关闭后发布；刷新 401/503/断网立即清额度与代际、保留历史用量。六组生产失败回归通过，工作区全量 build 成功，1165 passed / 1 既有 skip。Claude 接入代码独立开发，不混入此修复提交。

最新阶段已接入真实 Codex 有界额度：[CODEX_QUOTA_LIVE_HANDOFF.md](CODEX_QUOTA_LIVE_HANDOFF.md)。后续审查认可纯内存账号前后比较，不再因缺稳定 accountID 永久未知；427 ms 实测两个 available 窗口，30 秒 TTL / 15 秒重验，原身份不输出或持久化。全量 build 成功，1163 passed / 1 既有 skip / 0 failed。SQLite OS 锁崩溃自动释放，同毫秒空快照优先、合法 map 不受未用 legacy 字段影响。下方结论为历史阶段，具体限制和最终验证以最新交接为准。

固定提交 af92b55 的实际 RPC/真实双进程活锁与崩溃恢复回归全部通过；正式 API/生产页面已显示真实 Codex 额度并在 24 秒内重验。HUD29708、Dashboard49812/3847 恢复，主屏偏好不变；16 组布局、4 组 hover、2 组真实原生窗口检查通过，物理输入仍未测。最终证据在仓库外 subscription-rings 的 live-* 与 account-live-* 文件。

## 独立审查修复与额度归属降级（2026-10-03 UTC，优先于下方历史结论）

最终固定提交、生产像素/原生验证及官方 account/read→额度→account/read 实测字段和失败层级见 [ACCOUNT_QUOTA_REVIEW.md](ACCOUNT_QUOTA_REVIEW.md)。查询成功且无认证失败；当前账号响应仅 type/email/planType、账号事件仅 authMode/planType，缺少可用的稳定非秘密身份，未使用邮箱或随机连接代际冒充账号证明。

Implemented:
修复 0cc3de8 审查的三项问题。额度显示必须同时具备观察携带的 opaque generation 与当前已确认登录代际，缺证明、登出、切号、迟到旧账号响应均为 unknown；旧 bucket/reset 元数据也不显示。现有 Codex proxy/短时 stdio 与 Claude statusline 只能提供窗口，不能证明当前账号登录代际，服务边界因此移除其 windows，不将缓存或设备身份当账号证明。没有读取或保存凭据、邮箱、账号原始身份。

Claude capture 使用跨进程 mkdir 锁，在同一临界区比较入口 observedAt 后原子替换；较新的空窗口也阻止旧快照覆盖。锁等待有界，失败保留未知，不强行删除别人持有的锁。Codex 不合法 bucket ID 拒绝整份观察，避免安全化成同一 unknown 后错误选择百分比。

短时官方 stdio 查询、费用缺失语义和完整模型分组一并交付：真实查询可用，查询进程正常 stdin EOF 退出；模型/设备/项目估算缺失显示未知，合法零费用仍保留。不会重复导入或累计观察。

Not completed:
真实账号登录代际接入尚未完成，正式额度圈均诚实未知；下方“Codex 2 个 available”仅为此前阶段观察，不代表当前正式显示或账号归属已通过。Claude 未修改用户 statusline 设置，组合接入须保留原输出，具体方案见 SUBSCRIPTION_RINGS_PLAN。原两张参考图经支持流程一次明确本机路径重试仍因官方 helper 的 Windows os.setxattr 不可用未落地，未查看或绕过。物理鼠标、点击穿透、双屏跨缝投递仍未实测；150%/100% 为屏幕枚举及原生控制器注入证据，不等同物理输入通过。

Files changed:
core subscription-usage/usage-rings/usage-metadata 与测试；CLI subscriptions 与 capture/proxy 测试；共用 UsageRings/UsageToolDetails、本地用量页；生产 UI 和固定 Git 提交回归脚本；架构、计划与交接文档。

Tests:
最终全量 build exit0；全量 test exit0：1155 passed / 1 原有 Windows POSIX skip / 0 failed，132 files。生产 renderer 的切号/登出/旧响应、未知/过期、周期与 reset 独立、多工具、滚动、键盘和 reduced-motion，以及 16 组布局回归另记交接最终验证记录。固定 SHA 脚本只读取 git show 的源码、生成隔离临时模块，真实双进程测试 capture；不读取用户登录或日志。

Three highest-priority manual tests:
1. 接入可靠登录代际后，真实切号/登出及迟到 A 响应必须立即保持未知，确认账号共享范围与 reset。
2. 用户授权 Claude 原 statusline 组合后，验证保留原输出、跨进程捕获顺序及较新空快照失效。
3. 150% 主屏与 100% 副屏物理鼠标测试跨缝、快速反向、第三目标、外侧 8 DIP 点击穿透及键盘详情滚动。

## 追加推进：真实 Codex stdio 额度接通与缺失费用修复（2026-10-03 UTC）

Implemented:
按用户追加授权继续官方连接诊断。现有 daemon control socket 仍不可连接（exit1，dead network/os10050），但官方短时 `app-server --listen stdio://` 实测成功：initialize→initialized→account/rateLimits/read，返回2个真实窗口；整次349ms，结果至stdin EOF正常exit0约17ms。客户端不读/复制凭据、不发login或token-refresh、不创建thread/turn、不启持久daemon或网络监听、不增加持久授权。现有CLI自身使用既有登录；本轮只对该进程临时关闭analytics，不改配置文件。新增有界stdio fallback（查询5秒/退出1秒），现有daemon优先；每分钟缓存/合并并发，不逐帧或按四周期重复启动。正常stdio等待EOF退出，仅超时终止自己创建的子进程；server要求外部token刷新时直接返回未知，不供应凭据。

修复旧本地用量页的汇总卡和model/device/project金额表：领域 UsageTotals 附加 estimatedCost|null/missingEstimates，保留旧cost数字及传输/解析语义；无估算显示未知，真实pricing/log零值仍可显示0，混合缺失提示部分估算。hover分组保留tool/provider/model三重身份及所有token类别，补跨工具同模型/跨provider/部分费用测试。正式API实测 groupTokensEqualDevice=true、groupModelsComplete=true。

Not completed:
Claude尚未配置capture：只提供用户可显式启用的CLI适配器和组合原statusline的可审查方案。需要把现有脚本收到的同一JSON分支送进 capture-claude-limits，之后继续原脚本输出；不会直接以捕获命令替换原statusline。设置变更未授权，未改Claude settings/statusline、安全/隐私设置或请求模型响应。需要实际启用配置时由用户明确选择，不能冒称已接通。真实物理pointer/背景点击投递仍未测。

两张参考图继续阻塞：先现场核对原目标为空，再使用当前官方helper对明确本机 `.tmp/reference-images-followup` 重试一次；仍为 os.setxattr AttributeError，两个最终目标exists=false，未绕过helper/权限、未查看图。新版先前可用合成截图Library ID仍为libfile_bd9eb0826b2c8191bac4a5d77a5cc016；本轮不上传实际账号额度或私人用量截图。

Files changed:
CLI local-control/subscriptions.ts与subscription-proxy.test.ts；core usage-metadata.ts、usage-metadata/usage-rings测试；web本地用量页；verify-ring-layout.cjs费用断言；SUBSCRIPTION_RINGS_PLAN、PROJECT_STATE、HANDOFF、ARCHITECTURE。

Tests:
最终build exit0；完整test exit0，1151passed/1既有POSIX skip/0failed，132files（core133/CLI869/web52/widget59/site38）。4条新增测试覆盖stdio EOF正常退出、拒绝token-refresh、费用unknown/真实0/部分缺失以及跨tool/provider同名model和全部token类别。生产额度2组normal/reduced通过；16组页面/多设备布局通过，汇总卡及所有model/device/project金额单元均保留未知，0pageerror。大历史/去重完整测试仍通过，Electron staged与Node SQLite绑定验证通过。此前悬停与真实150%/100%原生检查证据仍适用：本次未改其窗口/动效/交互实现。

证据在C:\AI-Tools\ai-dev-hud-evidence\subscription-rings：codex-stdio-diagnostic.json（真实白名单窗口，不入Git）、codex-daemon-probe.json、codex-stdio-initial-diagnostic.json（初次诊断被stderr字节阈值提前中断；未保存raw stderr，改为排空丢弃后成功）、library-reference-retry.json、resident-followup-api.json；followup子目录包含生产JSON/PNG及最终build/test/layout/quota日志。无原始日志、提示、回复、凭据或私有DB提交/上传。

正式恢复：HUD72944、Dashboard5872/3847，auth/status200、usage200、真实设备1；CodexWindows2、codexStates=[available,available]、ClaudeConnected=false。主屏偏好1220717916和设置SHA256 0B8F01CDE4F30A02DD528CAB3F36C88010E38D23E8CCED7851C01068A8B4DCC2不变。本次为0cc3de8之后的独立修复提交，最终SHA/远端由git核对，不改写历史。

Three highest-priority manual tests:
1. 在真实账号上核对Codex各bucket/实际window/reset、到期回未知及账号切换，确认短时stdio退出且无持久daemon。
2. 用户明确启用Claude组合方案后核对原statusline输出保持、首个响应后的5h/7d与独立缺失；拒绝新认证/凭据处理。
3. 物理两屏pointer/click-through与实际数据金额unknown/真实0/部分缺失、跨provider模型，以及历史传输和项目功能。


## 新阶段：工具套餐同心环与独立更多详情（2026-10-03 UTC）

起点实测为 `15ee57f`，分支 `feat/local-control-center`，初始工作区干净；ARCHITECTURE/HANDOFF 位于 docs，仓库现场无 .agents 目录。实施方案见 `docs/SUBSCRIPTION_RINGS_PLAN.md`；以下替代旧设备份额弧的 UI 说明，metadata/API 的原采集份额字段仍保留兼容。

Implemented:
默认 HUD 仅设备图标与工具同心环，Claude Code 橙色、OpenAI/Codex 白色，额外工具向外加环，工具槽保留历史来源以避免短周期换环。未知/过期使用虚线且无百分比弧；导入设备不复制本机账号额度。hover 保留已有固定壳/走廊/两层有界 crossfade，按工具列模型 tokens、金额与官方实际套餐窗口，删除会话/采集记录数及重复费用标题。底部详情图标轻微放大，点击独立更多详情 panel；四周期选择在 hover 层，panel 只说明当前统计日期及与套餐窗口的区别。模型金额未知为 null/“金额未知”，估算说明保留 tooltip 与二级说明。共用本地用量页，项目及大历史传输不改。

Core 新增账号共享额度 DTO/白名单归一化/窗口有效期；Codex 优先多 bucket，不把 bucket 当模型，也不硬编码 primary=5h；主环取通用 bucket 的最长实际窗口，多未知 bucket 不相加。CLI 仅探测并连接已运行 daemon 的 proxy，超时/响应有界，只做 initialize/rateLimits/read，不读 auth/account/会话或启服务。Claude 增加可选 `capture-claude-limits` stdin 命令，仅存五小时/七天额度白名单，不覆写 statusline 配置，不累计其上下文 tokens。观测附加到四周期 typed API，不写 usage DB，不进入 metadata 导出。

Not completed:
真实账号额度端到端未接通：Codex 0.154.0 的现有 control socket 实测不可连接；Claude Code 2.1.284 存在，但未配置捕获、不发模型请求，所以正式快照 subscriptions=[]，UI 诚实显示未知。最小可选接入方案在计划文档，未启动 daemon、抽取凭据、读取私有 OAuth API 或新增云服务。官方接口存在不能等同本机额度已读到。

两张用户参考截图 `libfile_d68642b587a88191b0a5b21cfd0b7cfe` / `libfile_ba021f4620788191a5494bd47e8d79eb` 已按 Library 当前技能及 resolved-reference 流程准备；官方 helper 在 Windows 因 `os.setxattr` 缺失而失败，没有完成物化/实际查看，没有绕过。新版生产 PNG 已实际目视检查；发现并修复周期切换日期文本不响应与旧样式残留。新版合成截图已成功保存 Library：`libfile_bd9eb0826b2c8191bac4a5d77a5cc016`（subscription-hover-motion.png）；本地 xattrs 写回仍受同一 Windows helper 限制，不声称本地身份元数据持久化成功。

真实物理桌面 pointer/背景点击投递未测：本次可用工具无 computer-use 技能所需 node_repl/@oai/sky，未自制输入工具绕过。显示器重新枚举已恢复 150% 主屏1220717916和100%副屏4189372782；真实 Electron 在两屏窗口/rail/bounds/setShape/no-focus 验证通过，但指针为控制器注入，不等于物理输入验收。常驻实际窗口 bounds 未额外读取，不用隔离实例代替。

Files changed:
core subscription-usage.ts / usage-rings.ts / index.ts 与额度测试；CLI local-control/subscriptions.ts、api/local-control.ts、cli.ts 与白名单/proxy测试；web UsageRings.svelte、UsageToolDetails.svelte、本地用量页；widget renderer/Hud.svelte；三个既有生产回归脚本及新 verify-subscription-rings.cjs；.gitignore（仅忽略临时验证目录）；PROJECT_STATE/HANDOFF/ARCHITECTURE/TOKEN_RINGS_PLAN 与新 SUBSCRIPTION_RINGS_PLAN。

Tests:
最终 `pnpm.cmd build` exit0；`pnpm.cmd test` exit0，1147 passed / 1既有Windows POSIX skip / 0failed，132 files（core131 / CLI867 / web52 / widget59 / site38）。新增9条测试覆盖多bucket/实际窗口/真实0与null/未知/过期/reset/Claude上下文及网关排除/金额缺失/白名单不累计/proxy allowlist、错误与大小限制。Electron staged SQLite binding已验证、shared Node binding未改；完整大历史WAL快照/分块导出/取消/去重测试通过。

生产组件最终4组hover连续路径（1/1.5×normal/reduced）通过：跨缝停留、60ms反向、同圈重入、第三/第四设备、Tab/Escape、固定rail、Dashboard；最多正常2层/reduced1层。16组布局（网页1280→420→320→280→1280，HUD3/4/8/12设备×1/1.5）通过，54个HUD设备可键盘到达，滚动不挡Dashboard。新额度UI2组normal/reduced通过：5工具同心环、fresh/unknown/stale、账号共享不分配给导入设备、3小时实际窗口、不受统计周期影响、日期响应、金额未知、滚动及独立panel。两块真实显示器原生测试通过。早期失败分别为旧测试“离开”坐标落入更高卡片、测试遗漏 enabled 和原生采样落在40ms插值中；已修正测试路径/初始化/等待实际收敛后保持严格断言复跑通过，未添加skip。像素目视检查4种状态及日期修复后的hover/panel。

证据：`C:\AI-Tools\ai-dev-hud-evidence\subscription-rings`，包含 subscription-ui.json、hover-continuity.json、rings-layout-regression.json、hover-native-bounds.json、8张subscription状态PNG、9张hover切换PNG、4份连续webm、布局PNG、最终build/tests及回归日志、resident-readiness.json。数据/DB/原始日志/提示/回复/源码采集/凭据均不commit。

正式恢复实测：旧HUD18040/Dashboard68272经身份核验后仅重启本仓库进程；新正常launcher HUD53768、Dashboard68976（3847）。preferredDisplay1220717916、settings SHA256 `0B8F01CDE4F30A02DD528CAB3F36C88010E38D23E8CCED7851C01068A8B4DCC2` 未变；auth/status200、usage200、真实deviceCount1、四周期齐全、subscriptionObservationCount0。完成本轮后停止，等待独立审查或下一项明确授权。

Three highest-priority manual tests:
1. 在真实150%主屏和100%副屏，物理边缘→设备→间隙→模型行、60ms反向与第三目标切换；验真实背景8 DIP/透明区点击投递、不抢焦点及显示器断开恢复。
2. 用户选择最小官方额度接入后核对实际账号共享百分比、各bucket/窗口/reset、过期回未知与账号切换；Claude原statusline输出保持可用，不接私有OAuth接口或自动启daemon。
3. 真实数据下四统计时段、更多工具/设备、滚动/键盘/reduced-motion、费用未知与真实0区别，以及项目Launcher和大历史传输回归。


## 独立复核 P2：快速反向内容层有界（2026-10-03 UTC）

Implemented: 修复keyed fade在60 ms往返中累积多个outro层的问题。新增纯presentation ContentBlend，最多current/previous两层；反向交换层并保留当前权重，同圈重入不重启动画，第三设备中断仅保留占主导的旧层。移除内容outro，单壳/尖角动效保持；isolated plus-lighter合成避免共同文字在crossfade中因常规alpha叠加变暗。正常crossfade仍会短暂显示两份不同内容，这是预期过渡，不再累积第三层。

Not completed: 物理桌面pointer、真实150%主屏及混合DPI、真实背景点击投递仍未实测。当前实际枚举仅KB220Q H2（4189372782，100%）；原AW2725QF preferredDisplay1220717916恢复属于设置恢复，不是150%实测。Library准备入口失败且无确认IDs，未绕过既定上传路径。

Files changed: UsageRings.svelte；web/lib/usage-content-transition.ts与tests/usage-content-transition.test.ts；scripts/verify-hud-hover.cjs；docs/PROJECT_STATE.md、HANDOFF.md、ARCHITECTURE.md。

Tests: 完整build exit0；完整test exit0，1138 passed / 1既有POSIX skip / 0 failed，129 files。3条新增单测覆盖60 ms反向/同圈、重复第三设备中断、reduced/close。生产组件4组连续路径全部通过：normal共215帧最多2层，reduced共206帧最多1层，内容权重和最大误差约1e-6；均同一shell，零pageerror。60 ms往返16次、同圈重入、第三/第四圈中断、键盘/收起/Dashboard正常。16组/62圈布局复跑通过，实际100% Electron原生bounds/rail/注入走廊/不focus复跑通过。

新证据在C:\AI-Tools\ai-dev-hud-evidence\hover-bounded：hover-continuity.json；4份hover-path-*.webm；9帧hover-switch-*.png；bounded-video-frame-{0,1,2}.png（新版录制3.4/3.6/4.0秒抽帧，已目视检查：仅预期两层淡化或单层，无多outro堆积）；hover-native-bounds.json；rings-layout-regression.json；bounded-{build,tests,layout}.log。保留原证据不覆盖。

正式恢复：正常launcher最新PID18040；preferredDisplay1220717916和设置SHA256 0B8F01CDE4F30A02DD528CAB3F36C88010E38D23E8CCED7851C01068A8B4DCC2未变，Dashboard3847/auth/status HTTP200。常驻实际原生bounds未测，不用隔离实例代替。完成本轮后停止。

Three highest-priority manual tests:
1. 总圈↔本机圈60 ms快速往返、同圈重入和第三设备中断，观察是否出现额外旧内容层、明显变暗或壳/尖角跳变。
2. 原150%主屏重新被枚举后实测pointer路径、混合DPI、持久偏好、focus及真实背景点击穿透。
3. normal/reduced、Tab/Escape、多设备及窄屏、中英Dashboard和大历史传输回归。


## 最新阶段：悬停明细与连续动效（2026-10-03 UTC）


Implemented: 固定376×536 DIP透明画布、原216 DIP居中圈槽；hover无需click打开左侧明细；持续外壳位置/尺寸/尖角动效与内容crossfade；圈到卡的原生孔洞走廊保留、220 ms可取消离开；原生形状让透明背景及外侧8 DIP点击穿透；reduced-motion覆盖主进程/renderer；记住暂时断开显示器的偏好。沿用typed四周期及真实来源，没有配额/回本或云同步。

Not completed: 当前仅枚举100% KB220Q H2（4189372782），150% AW2725QF主屏不可见。真实主屏/混合DPI换屏、物理鼠标跨圈/间隙与实际背景点击投递未实测。computer-use技能要求node_repl/@oai/sky，本轮工具没有node_repl；没有绕过限制调用自制桌面输入工具。原生测试注入控制器指针，不能称为真实桌面路径验收。动画参数是本轮调参，不是视频实测值。

Files changed: web UsageRings；widget Hud/main/preload/hud-window/hud-hover及两项单测；scripts/verify-hud-hover.cjs和verify-hud-native-bounds.cjs；docs/HANDOFF、PROJECT_STATE、ARCHITECTURE。

Tests: 完整build exit0；完整test exit0，1135 passed / 1既有POSIX skip / 0 failed，128 files。4组连续生产组件路径（scale1/1.5×正常/reduced）通过，4份webm、9帧PNG和hover-continuity.json。浏览器resize/多设备16组62圈布局回归通过。真实Electron在当前100%屏通过：窗口展开前后{704,668,376,536}，rail窗口内{320,160,56,216}完全相同；setShape接受透明孔洞与8 DIP排除，指针注入走廊保持、不focus。所有视觉数据为合成数据。没有用RAF间隔代替连续动画证明。

常驻: 正常launcher启动PID47124；原主屏preferredDisplay1220717916与settingsSha256 0b8f01cde4f30a02dd528cab3f36c88010e38d23e8cced7851c01068a8b4dcc2已恢复，自动回退屏不会覆盖偏好。Dashboard3847/auth/status HTTP200。常驻原生bounds/真实鼠标动画仍未验证，不能沿用隔离实例证据冒充。

Three highest-priority manual tests:
1. 主屏恢复后沿边缘→总圈→间隙→模型行→设备圈缓慢移动，快速反向及离开后返回，观察卡壳、尖角、内容过渡与圈槽无跳位。
2. 主屏150%/副屏100%实际换屏，核对偏好恢复、不抢focus、外侧8 DIP及透明背景实际点击落到后方窗口。
3. 正常/reduced-motion、Tab/Escape、四周期与真实单设备，以及网页中英/窄屏、Dashboard和历史导入导出回归。


下方为历史阶段记录；当前状态以本节及docs/HANDOFF.md为准。

## 当前交接：悬停明细与连续动效优化待实施（2026-10-03 UTC）

用户最新反馈右侧滑动唤起不够丝滑，圈hover不能自然展开明细，并授权继续优化参考交互。随后要求切换到新项目任务聊天；本轮在纯文档边界暂停，没有产品代码修改，没有正在运行的测试写入。完整项目交接见docs/HANDOFF.md，新参考视频观察要点待补齐后实施。

Implemented: 已读实际组件/控制器并只读核对正式HUD59724、Dashboard68272（3847 auth/status HTTP200）、主屏/窗口与持久设置哈希未变。源码确认rail圈detailsEnabled=false导致只有click才展开；hud:set-expanded立即改变56×216→376×536并垂直重居中，rail顶部跳160 DIP；main16ms timeout+IPC驱动reveal，圈间卡片内容/位置瞬时替换，仅首次fly；summary与rail保持区分离，native reduce策略尚未接入。前几项是源码事实，实际连续视觉卡顿/间隙关闭仍需复现，不宣称已测通过。未重启进程、移动鼠标、拍摄真实用量或导出metadata。

Not completed: 新参考逐段观察、真实鼠标完整路径复现、悬停明细与可中断连续动效实现、连续视觉/双屏DPI/键盘/减少动态效果/穿透验收。当前产品仍44e148fed7c8a0c3536a73693180898a87de6b00，上一节以后均为已完成历史；新交互不属于旧成功结论。

Files changed: 仅docs/HANDOFF.md与本状态文档。Tests: 本轮只读进程/原生窗口/HTTP状态检查，无新产品测试；44e148f已有完整build成功、1132passed/1原有skip/0failed及布局/原生验收。本次不重复运行未改变的产品测试。

Three highest-priority manual tests:
1. 不点击进入主屏右缘并悬停圈，确认明细自然出现且圈位不跳。
2. 圈→卡片→其他圈→离开，确认内容连续、保持可读与反向不闪灭。
3. 双屏DPI、减少动态效果、键盘/穿透与Dashboard打开保持可用。

## 最新收尾：独立复核两项响应布局 P2（2026-10-03 UTC，已验收）

父任务独立审查复现两项真实生产 Svelte 问题：网页明细打开后从1280缩到420时位置未重算，卡片右侧越界；HUD四台设备使圈组换行后，明细遮挡Dashboard并把按钮推出536 DIP窗口。本轮只修这些布局问题，以下较早验收结论保留为历史，当前状态以本节为准。

Implemented: 共享圈组用ResizeObserver观察容器尺寸变化并重算正在打开的明细位置，保持activeKey与键盘焦点，销毁时断开观察。HUD圈槽最多104 DIP并可滚动；明细参与内容流，summary-scroll承载可滚动内容，header/周期/footer/更新时间不收缩。最多一个明细，Dashboard始终有独立可点击空间。未改typed数据来源、日期/sum/费用语义、parser、窗口尺寸或边缘控制器。

Tests: 最终 `pnpm.cmd build` 和 `pnpm.cmd test` 均exit0；1,132 passed / 1原有Windows POSIX权限skip / 0failed，128files（core127 / CLI862 / web49 / widget56 / site38），无新增skip。新增 `scripts/verify-ring-layout.cjs` 对实际生产构建进行浏览器回归：100%/150%两档、打开明细后1280→420→320→280→1280，以及376×536 HUD的3/4/8/12台设备，共16组、62次逐圈焦点检查，0pageerror。420卡片x60宽300右360；320卡片x18宽284右302；280卡片x18宽244右262。选中设备、焦点与单明细均保持。HUD明细底459，Dashboard从469到504，中心实际命中按钮且调用打开回调；每个设备均可经键盘滚动到圈槽内。

真实Windows Electron另外分别用4台、12台合成设备，在主屏150% / 副屏100%验收：右锚定、向左展开、原生边缘唤起/点击穿透/不抢焦点、快速反向、托盘暂停恢复、动画中换屏、明细不遮按钮、Escape保留展开态、实际打开独立测试Dashboard HTTP200均通过。每屏缓存周期反向采样120帧，rAF间隔中位约6.1ms、P95约6.1–6.2ms；4设备最差14ms，12设备最差7.1ms；长任务0、动画新增API请求0、隐藏后动画回调0。这是本次环境采样，不是帧率保证，不将上一轮16.7ms结果套用于本轮。

真实运行：正式launcher恢复新版常驻HUD PID59724，Dashboard仍PID68272 / `http://127.0.0.1:3847`。实际用户profile验证主屏上下边缘、四周期、Codex Today与原API合计一致、真实Dashboard打开、0pageerror；仅一台真实本机，其他设备只用于明确的合成测试。恢复后又对常驻59724做原生唤起/固定右边缘/前台焦点保持/离开隐藏检查通过。主屏仍1220717916；widget-settings.json SHA256仍 `0B8F01CDE4F30A02DD528CAB3F36C88010E38D23E8CCED7851C01068A8B4DCC2`。没有导出真实metadata、拍摄真实用量截图、停止用户Codex或修改另一个实验。

证据在仓库外 `C:\AI-Tools\ai-dev-hud-evidence`：rings-layout-full-{build,tests}.log；rings-layout-regression.json；rings-layout-native-{4,12}.{json,log}；rings-layout-live-verification.json、rings-layout-live.log、rings-layout-restored-resident.json；rings-layout-page-{420,320,280}-{1,1.5}.png、rings-layout-hud-{3,4,8,12}-{1,1.5}.png、rings-layout-native-{collapsed,expanded,detail}-{4,12}-{displayId}.png。所有图像使用合成数据，证据和私人运行数据不进入Git。

Not completed: 真实另外两台电脑接入、外部同步、任意历史/设备规模性能保证与未授权后续阶段仍未实现；无本轮阻塞。停止新增产品功能。

Files changed: web共享UsageRings.svelte、widget renderer/Hud.svelte、生产组件回归脚本scripts/verify-ring-layout.cjs，以及ARCHITECTURE / PROJECT_STATE / TOKEN_RINGS_PLAN文档。无依赖或lockfile变更。

Three highest-priority manual tests:
1. 网页打开设备明细后把窗口缩到420、320或更窄，确认卡片在视窗内且同一设备仍选中，键盘焦点不丢。
2. 显式导入多设备metadata后，在HUD展开并切换不同设备明细，滚动圈组和内容；确认最多一个明细、Dashboard始终可点且不会被推出窗口。
3. 在100%/150%两屏检查原右边缘唤起、向左展开、离开收回及真实Dashboard打开；确认四周期与本机Codex Today统计保持一致。

## 最新交付：设备 Token 用量圈（2026-10-03 UTC，已验收并停止）

用户明确追加的参考交互范围见 TOKEN_RINGS_PLAN.md。本轮完成并停止，不启动同步或后续产品阶段。数据层独立提交 `9f858fad4406c0a54b73d86dbceee21ac0b365c4`，共享 UI / HUD / 验证文档另行提交。下方各历史里程碑保留原记录，不覆盖本段最新状态。

Implemented: core / CLI 同一去重来源的四个自然日周期 snapshot，设备弧为同周期已采集总量占比，总圈只是总量标识；没有配额或回本倍数。真实 tool/provider/model、会话与用量记录、API 等价估值及缺失数量；一次读取四周期、使用同一时钟。导入接收时间仅存本地 receipt 表，旧历史无可信时间为 null，不写入 metadata 导出。web / widget 共用细环、灰底轨、自有图标、金 / 青 / 橙 / 灰紫与单一明细浮层；数值/SVG 有限插值、浮层 transform/opacity、键盘/触屏/Escape、快速反向、减少动态效果和隐藏后停止动画。HUD 折叠为总量及设备圈，展开保留四周期、本机 Codex Today 与可点击的 Dashboard 按钮；未接入设备只说明，不生成假 ID 或假零值。parser、窗口/边缘控制器和云同步行为未改。

Tests: 最终 `pnpm.cmd build` exit0，包含 core/web/CLI/widget 与 Node/Electron SQLite ABI；`pnpm.cmd test` exit0，1,132 passed / 1 原有 Windows POSIX 权限 skip / 0 failed，128 files（core127 / CLI862 / web49 / widget56 / site38）。无新增 skip；site 构建不在根 build 中，未声称已执行。实际 Edge 合成 Codex120 + Claude40，手动 Mac80 / 8日前 Windows250，今日及7天240、30天及累计490；设备求和/占比、重复导入、接收时间已知/历史未知、无估值、单浮层、Escape 保留焦点、触屏切换、减少动态效果与空数据 typed UI fixture 通过，原 provider API 仍160。空数据领域测试为真实空记录，浏览器空数据为明确的合成 API fixture。

Windows Electron 实测：主屏 AW2725QF 150% / 副屏 KB220Q H2 100%，56×216 DIP 折叠、376×536 DIP 展开，右边缘固定/向左展开、外侧点击穿透、不抢焦点、快速返回/反向、托盘暂停恢复、动画中换屏、明细不遮 Dashboard 按钮、Escape 不误收起展开态、实际打开测试 Dashboard 均通过。连续缓存周期反向切换每屏各采样120帧，rAF间隔中位16.7ms / P95约16.8ms / 最差约16.9ms、长任务0；动画请求API0，隐藏后renderer动画回调0。Edge 120帧也约16.7/16.8ms。此为当前合成负载和 Chromium 采样，不能外推到视频未知帧率、任意设备/任意历史规模。普通 overview 仍沿用原内存聚合；分块传输回归含60,123条SQLite历史测试通过。

实际运行：仅重启本任务 Dashboard59516→68272，仍为 `http://127.0.0.1:3847`，认证状态保持；正式 launcher 恢复 HUD PID76788。真实用户配置 / 数据验证主屏上下边缘唤起、不抢焦点、四周期、Codex Today 与原 API 及设备圈模型合计一致、打开真实 Dashboard，无 pageerror。真实仅一台本机，未宣称笔记本或 MacBook 已接入。主屏仍1220717916，widget-settings.json SHA256 `0B8F01CDE4F30A02DD528CAB3F36C88010E38D23E8CCED7851C01068A8B4DCC2` 完全未改。恢复后的常驻进程又做原生唤起/右锚定/焦点/离开隐藏检查通过；150%下物理折叠bounds为3756,882—3840,1206。未导出真实metadata或拍摄真实用量截图，未停止用户 Codex 会话。

诊断：最初实机检查发现非聚焦 hover 的 Escape 无效、HUD浮层遮挡按钮，均修复后重新完整构建及验收；初次测试观察器漏传入口导致启动错误、原生点击保护曾拒绝非测试窗口，修正测试入口/测试窗口归属后复测通过，未弱化保护或作为产品成功证据。

证据均在仓库外 `C:\AI-Tools\ai-dev-hud-evidence`：rings-full-build.log / rings-full-tests.log；rings-gui-verification.json、rings-hud-verification.json、rings-live-verification.json、rings-restored-resident.json、rings-resident-dashboard.json；rings-page-{mac-detail,lifetime,empty}.png、rings-hud-{collapsed,expanded,detail}-{displayId}.png。图像与 metadata fixture 均为合成，未进入 Git。

Not completed: 另外两台真实电脑接入与跨设备端到端同步、设备别名/身份合并、官方最近会话 adapter（原 daemon control socket 10050 仍未处理）；均不属于本轮。未实现顶部 dock、Win32 AppBar、自动启动、全屏隐藏、引擎集成。导入只按既有 deviceKey+recordKey 去重，不自行猜测跨身份复制日志是否同一设备。无当前里程碑阻塞。

Files changed: core usage-rings / usage-metadata / index；CLI local-control/usage / API local-control；web UsageRings / local-usage；widget dashboard-client / hud-data / main / renderer/Hud；相应 core/CLI/widget 测试与项目文档。

Three highest-priority manual tests:
1. 在主屏右侧任意高度停留，展开/收回与快速返回顺手；四周期切换和明细滚动时 Dashboard 按钮仍可点。
2. 各设备圈相加等于同周期总圈，悬停/键盘/Escape/触屏切换名称、颜色与模型一致；空数据没有假设备或假额度。
3. 显式导入另一台电脑的 metadata 后再次导入，确认不重复计数、来源写为手动导入而非实时在线，接收时间与未知估值表达正确。

## 最新修正：延迟导出创建响应的生命周期竞态（2026-10-03 UTC）

父任务独立审查发现 P2：导出任务尚未返回 ID 时离开页面，销毁回调无法取消；旧创建响应随后仍会触发下载。本次仅修此竞态及相邻取消/重复点击状态，无新增产品功能。

Implemented: 取得任务 ID 后、同步下载回调之前再次检查 mounted/cancelRequested；页面已销毁或用户已取消时，只调用该任务的 cancel 并返回，不下载、不轮询。创建期间也显示取消按钮；导出入口先检查 busy/mounted，再清空旧状态，避免重复点击重置取消标记或创建第二个任务。小型 typed lifecycle helper 与实际页面共用同一逻辑。

Tests: pnpm.cmd build exit0；pnpm.cmd test 1,125 passed、1原有Windows POSIX权限skip、0failed，127files（core123/CLI861/web49/widget54/site38）。新增5个延迟生命周期测试覆盖离页、创建期间取消、已停止、正常下载和取消失败不下载。Windows Edge 真实 API 延迟创建响应：SPA离页 download0/cancel1；创建期间取消 download0/cancel1；重复普通/程序化点击均仅创建一个任务、正常下载一次，无 pageerror。证据 export-lifecycle-gui.json、export-lifecycle-page-left.png、export-lifecycle-creation-cancelled.png、export-lifecycle-full-build.log、export-lifecycle-full-tests.log。均用仓库外独立配置及空合成数据库。

运行：Dashboard仍为PID59516，127.0.0.1:3847；只读核对已提供最新构建的SPA静态页，无须重启。HUD仍为PID42052，源码/设置未改；未导出真实metadata、启动Codex或配置同步。

Not completed: 真正外部同步和官方最近会话列表状态同前，仍等待同步决策；无本修复阻塞。取消接口本身失败时显示错误且不会触发下载，既有服务端任务超时仍有效。

Files changed: web routes/local-usage/+page.svelte、lib/usage-export-lifecycle.ts、tests/usage-export-lifecycle.test.ts 与本状态文档。

Three highest-priority manual tests:
1. 导出创建响应较慢时立即切换到其他Dashboard页；确认没有随后出现的下载。
2. 创建任务期间点击取消，确认返回后显示已取消并能重新导出。
3. 快速重复点击导出，确认只有一个下载；正常导出和既有HUD行为仍正确。


## 最新状态：本地大历史补齐（2026-10-03 UTC）

本批功能与合成验证已完成，停止新增功能，等待用户选择同步目录或云方案。未配置外部同步，未合并设备身份，未修改 HUD、provider parser 或 Dashboard 的视觉布局。

Implemented: 导出按钮生成 version 1 JSONL 分块容器，每块沿用既有 usage schema，最多 1,000 条、每行最多 2 MiB；header 与精确计数的 complete footer 用于识别缺失/截断。专用 SQLite 只读 WAL 快照和磁盘 TEMP 哈希索引避免全部历史驻留 JS；下载按背压流式输出，可查询进度和立即取消，任务有数量和超时限制。旧 version 1 JSON 文件及原 API 仍兼容 10 MiB / 50,000 条界限。浏览器按行读取 JSONL，顺序提交独立原子块，按设备/记录去重，本机解析器记录优先；缓存索引在解析器或外部数据库写入后失效。取消仅在确认当前块后停止；中途失败、错误/缺失 footer、响应丢失都显示已确认前缀和安全重试说明，文件读取百分比明确不等于导入成功。

官方会话元数据检查：已安装 Codex CLI 0.154.0；官方生成的公开 schema 有 `thread/list`、精确 cwd 过滤、`useStateDbOnly`。该参数用于不扫描 JSONL rollouts 的查询。然而本机 `codex app-server daemon version` 无法连接官方 control socket（Windows 错误 10050）。项目页报告 official-codex-app-server / daemon-unreachable，而不推断或伪造最近会话。检查仅执行 --version 和 daemon version，有 3 秒探测超时及 15 秒缓存；不会启动 daemon、读取原始会话、尝试登录或执行模型任务。即使 daemon 可连接，尚未建立安全 adapter 时仍明确标记 adapter-unavailable。

Tests: `pnpm.cmd build` exit 0；`pnpm.cmd test` 1,120 passed、1 原有 POSIX permission skip、0 failed，126 test files（core123 / CLI861 / web44 / widget54 / site38）。60,123 条文件数据库测试覆盖超旧界限导出、61 块、WAL 快照、跨 store 实例重复导入、本机权威与缓存失效、HTTP 响应性/取消/Origin；浏览器 importer 覆盖完整/空容器、旧 JSON、截断/错误 footer、私密字段/凭据 URL、超长行、取消与不确定响应。Windows Edge 实测 100,123 条纯合成记录，50,570,485 字节，取消后保留已确认 3,000 条，完整重试约 2,898 ms；故意在服务器提交后丢弃响应，界面提示可能已提交，重试去重后最终 100,124 条。实际保存导出文件为 101 块、50,570,990 字节，footer/总数/白名单检查通过；限速合成下载时点击立即取消且原生下载失败为未完整文件。原项目首页六类 kickoff、复制、语言持久化、目录登记/注销、旧 JSON 导入、原 Codex120+Claude40=160 provider 回归通过，无 pageerror。验证均采用独立配置；未导出真实用户 metadata。

运行状态：已将本任务自己的 Dashboard 服务由 PID48048 安全切换至 PID59516，仍为 127.0.0.1:3847。只读核对原 Codex Today 总数一致，新 local usage API 正常、非信任 Origin 返回403；HUD PID42052 与持久设置未变。本批 packages/widget 相对用户确认版本 1dfef6e 无差异，未停止用户 Codex 会话，未导出真实 metadata。

Not completed: 真正外部同步；跨设备端到端验证；官方最近会话列表（当前 transport 不可达，adapter 尚未接入）。普通 overview 聚合仍沿用既有内存聚合，本批只声明有界传输和已验证的十万条规模，不声称任意历史规模。取消不会回滚已确认块；重新导入通过幂等去重补齐。

Files changed: core usage-transfer/local-control；CLI usage/usage-export/session-metadata/local API 与大历史/只读探测测试；web usage-file、typed client、导入导出反馈和项目元数据原因；AGENTS/本计划/PRD/ARCHITECTURE/ROADMAP/PROJECT_STATE。证据和合成导出均位于仓库外 `C:\AI-Tools\ai-dev-hud-evidence`，不提交/上传。

Three highest-priority manual tests:
1. 在本地用导出按钮保存 JSONL，再重复导入两次，确认用量不增长；旧 JSON 文件也仍能导入。
2. 用合成大文件尝试中途取消、导入截断文件，再重试完整文件；确认只报告已确认记录，失败不显示全部完成。
3. 选中已登记项目查看官方会话来源和具体不可用原因；确认 HUD 仍按原方式滑入/收起，Dashboard 中英文及原 provider 用量正常。


更新：2026-10-03。Phase 0/1 完成，主屏 HUD 已由用户确认滑出。本地控制中心两批通过自动验收；独立复核发现的 metadata/目录校验问题已修复，真实 Launcher 按钮已在隔离工程验证启动到认证界面。当前分支 `feat/local-control-center`；实际 Dashboard 已加载修复。近期会话接口、登录后任务执行、云后端与视觉深化尚未完成。具体最新状态见文末“独立复核修复”；下方保留历史问题和验证记录。

## 历史主屏使用反馈：修复后的用户手动验收已确认可滑出

- 用户再次明确要求主屏使用。上一轮结论仅验证副屏，不满足此要求。开始只读检查时，PID80076仍存活，原生窗口已经位于主屏；不能仅据前一轮副屏目标推断这次原因。实际widget-settings.json不存在，显示器选择未持久化；主副屏接缝的原8 DIP触发带也容易被直接跨过。
- 最小修复：默认主屏、保存/恢复hudDisplayId、已失效选择回主屏，原widget保存设置保留HUD选择；触发带增至32 DIP，最后8 DIP仍点击穿透，rail按钮仍可点击，140ms防误触保留。Dashboard双语和parser未修改。
- 使用真实用户profile和生产代码，经已有widget设置API保存Windows主屏AW2725QF（150%、id1220717916）。普通launcher恢复常驻PID42052；只读Win32检查primary=true，实际窗口位于主屏，设置文件hudDisplayId也为主屏。鼠标在副屏时未转移目标。
- widget54项测试和构建通过；完整根构建exit0，根测试exit0：1,087 passed、1个上游skip、0failed（core117/web39/widget54/CLI839/site38）。新增接缝内侧停留、rail点击和保存选择/主屏fallback回归。
- 三处实际主屏输入验收尚未通过：第一次旧实例检查和随后真实用户实例/正常常驻实例验证均检测到鼠标位置在验证期间发生变化，安全助手停止进一步输入，未覆盖用户新位置；没有将此算成成功或弱化断言。不能把测试夹具或副屏成功代替主屏成功。当前无构建/测试阻塞；待稳定鼠标或用户手动上中下停留时观察真实主屏窗口可见。
- 证据在仓库外main-wake-before.json、main-wake-fixed.log、main-native-verification.log、main-wake-{widget,full}-{tests,build}.log。此前副屏的真实成功记录是历史事实，当前主屏实测状态以本节为准。

## 真实用户反馈：右缘唤起困难已修复

- 用户报告“貌似唤起不了”后，先检查实际常驻 PID30020：进程存活，创建时间晚于构建时间，是此前新版；原生窗口隐藏，停在主屏。真实鼠标当时位于副屏。未关闭其他应用或修改安全/显示设置。
- 在该真实进程上，主屏右缘上方停留后仍隐藏；中部原窄条高度停留后可见，前台窗口保持。说明轮询/启用/显示机制正常，原因是仅接受隐藏面板高度附近的触发区，以及所选屏幕与当前鼠标屏幕不同。不是用合成 fixture 代替此诊断。
- 修复：显式传入所选显示器 workArea，整个可用右缘 8 DIP 停留140ms即可唤起；保持450ms离开缓冲、反向动画、圆角、固定右缘和穿透/不抢焦点。托盘提示与菜单显示已启用/已暂停及所选屏幕，便于发现暂停和屏幕选择。原 Dashboard 双语、parser 和另一实验均未修改。
- 此前漏测原因：GUI验收脚本事先知道中部坐标，始终把鼠标送到该坐标；没有验证用户从任意右缘高度接近的路径，隐藏触发区不可发现的问题因此被遗漏。新增上/下工作区边缘、8 DIP附近、其他屏边缘和任务栏排除回归；不削弱旧断言。
- widget 测试52项和构建均 exit0；最终根 `pnpm.cmd build` exit0（core/web/CLI/widget，不含site）；根 `pnpm.cmd test` exit0，1,085 passed、1个上游skip、0 failed（core117/web39/widget52/CLI839/site38）。日志在仓库外 `wake-fix-{widget,full}-{tests,build}.log`。
- 使用真实 `C:\Users\30493` profile、生产 main.js、新代码、原数据，未设置 fixture home：所选副屏 KB220Q H2 上/下边缘（均不在面板高度）真实原生鼠标唤起、UI与 typed 今日用量一致、showInactive保持前台焦点，离开后原生隐藏，通过。实际鼠标 DIP 与两个真实显示器 scaleFactor/workArea已记录，隐私用量值仅留在本机证据。
- 验收后使用原 launcher 恢复正常常驻 PID80076，再对这个实例实际做一次面板高度以外的右缘停留：原生窗口由隐藏变可见，前台窗口不变。鼠标恢复原位置；若检测用户移动鼠标，验证助手会停止后续输入，不覆盖用户操作。
- 本机证据：`live-hud-before.json`、`live-hover-reproduction.json`、`live-wake-fixed.{json,log}`、`live-wake-fixed-{upperEdge,lowerEdge}.png`、`restored-whole-edge-wake.json`。新常驻目标为副屏；现在副屏整个可用右缘可唤起，其他目标通过托盘“显示器”选择。当前进程仅在本次重启内保持选择，未增加后续阶段功能。

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
# 本地控制中心追加（最新状态）

用户已明确确认主屏 HUD 可以滑出；不再把此前鼠标自动化被中断等同功能失败。已保留 `1dfef6e` HUD 行为，并从该提交建立 `feat/local-control-center`。用户新范围覆盖旧 Phase 1 停止条件，计划见 `LOCAL_CONTROL_PLAN.md`。

第一批完成：显式本地项目登记、并发去重、仅注销登记；最多 200 目录/3 层的发现，不跟随链接；Unity/Unreal/Git 标记；只读分支/dirty；约定文档有界阅读；中英 Codex Home；六种 kickoff 预览/复制；用户按钮打开已登记目录的交互 Codex，不自动传 prompt。近期会话元数据没有已集成的稳定接口，明确不可用，不读取原始会话内容。

实际用户环境发现官方 Codex CLI 0.154.0，已运行 `--version` / `--help`。启动路径不接受任意可执行文件/参数；PowerShell 参数用 UTF-16 编码、路径用字面量引用，不降低执行策略。所有新 API 继承同源/认证，另要求本机 loopback；密码开启的远程 Dashboard 不能读取本机项目或启动进程。

验证：core/web/CLI 构建通过；项目边界测试 7/7；完整测试 1094 passed、1 个原有 POSIX permission skip、0 failed。Windows Edge headless 在独立 profile/临时 Git 工程实测登记/发现/引擎/Git/文档/六种预览/复制/中英持久化/注销保留文件/恶意 Origin 拒绝，原 provider 汇总保持 Codex120+Claude40=160。证据在仓库外 `control-batch1-gui.json`、`control-batch1-home.png`、`control-batch1-full-tests.log`。没有替用户点击真实 Codex 启动按钮，实际交互终端与认证需手动验收；会话元数据未完成。

第二批完成：SQLite local-origin 记录与显式导入的 metadata 汇总；本机日历今日/滚动7天/30天/累计；模型/设备/项目标识、会话/用量记录、日活动与 API 等价 cost。已登记项目名称仅在本地映射显示，不进入导出。版本1传输白名单，标识散列，不含 sourceFile/cwd/hostname/原始session ID/正文/凭据；10 MiB 与50,000条限制。导入独立 `hud_usage_metadata` 表，事务、写队列、设备+记录去重、新版本更新/同版本冲突报告，本机 parser 记录优先。复用 `state.json` 稳定设备身份，尚未 init 时创建上游标准身份，保留已有文件。同步只提供 replaceable interface，未实现网络 adapter；本页只含本机和显式导入数据，不混入上游已有 cloud/synced_records。

最终验证：`pnpm.cmd build` core/web/CLI/widget 全通过；`pnpm.cmd test` 1104 passed / 1 原有 skip / 0 failed（core121、web39、CLI852、widget54、site38；123 test files）。新增领域4、存储/API6测试与第一批7测试均通过。Windows Edge 批2验证160→重复导入仍160→另一设备120后280、3个设备隔离会话、下载、安全字段、本地项目标签、首次设备初始化、原 provider160与语言持久化；截图已实际查看。首次 GUI 暴露缺失设备初始化，已修复；之后测试错误假设SQL首行是Codex，改为明确选已知Codex fixture，没有放宽验收。

实际用户服务：旧本仓库Dashboard PID65912经精确命令核验后重启为PID45928，127.0.0.1:3847，`/api/local/codex` 与 `/api/local/usage` 可用；新旧实际今日token聚合相等，恶意Origin403。HUD PID42052未停止；只读原生窗口仍在主屏右缘、84物理px宽（56DIP×150%），隐藏状态正常，widget源文件相对已验收分支无差异。未替用户点击真实Codex终端，不自动发出AI请求。

证据：仓库外 `control-batch2-gui.json` / `control-batch2-usage.png` / `control-final-tests.log` / `control-batch2-full-build.log` / `control-live-readiness.json` / `control-live-stat-crosscheck.json`。实际运行数据、临时工程和截图均未进入Git或远端。当前两批完成后停止；不部署云。

Implemented: 本地项目上下文、Codex Home/任务提示预览复制/显式启动入口；本地用量/版本化metadata导入导出/去重/同步接口。

Not completed: 最近会话元数据集成；用户账号配置下的登录后使用；大历史分块导出；跨设备项目自动归并/设备别名；云传输；视觉与交互深化。真实交互启动已由后续独立复核补验，见下节。

Files changed: core local-control/usage-metadata；CLI local-control 项目/launcher/usage 与 API handler；web codex/local-usage、typed clients/字典/导航/preprocess；新增测试与harness文档。

Tests: 两批Windows Edge、完整build/tests、实际常驻HUD只读检查、新旧Dashboard聚合和Origin保护；真实Codex只执行version/help，没有启动AI会话。

Three highest-priority manual tests:
1. 登记一个自己的工程，核对引擎/Git/约定文档，预览并复制任务提示，再注销，确认工程文件仍在。
2. 在自己的账号配置下打开Codex，核对目录与认证；自行粘贴提示前应没有自动AI请求（隔离配置下的实际启动已补验）。
3. 导出用量metadata并重复导入，再从另一设备显式导入；核对日期/设备/项目统计，同时检查主屏HUD与原Dashboard仍正常。

## 独立复核修复（当前最新）

父任务在36a95bc发现P1认证URL可能原样进入provider/model，以及P2启动目录junction重定向、枚举String强制转换允许数组。旧版本的“安全导出已完成”结论撤回，修复后的边界重新验收。

- model只允许有界普通/namespace标识、Ollama标签或日期revision，拒绝URL、userinfo、查询串/路径；provider采用更窄的普通标识。local数据中的异常值归unknown，import直接拒绝；不会读或导出真实秘密。合成认证URL与数字host userinfo回归，以及正常model保留回归通过。platform/costSource必须字符串枚举，数组/对象/null拒绝，整个invalid batch在写入前拒绝。
- Launcher在启动前重新realpath并与登记时canonical路径比较，junction/symlink重定向返回409；正常路径接受。真实Windows中文、空格、单引号路径通过UI按钮启动，原生只读process cwd逐字匹配；命令行只有官方codex.exe、无prompt/exec/危险参数。按钮POST只有confirm=true，返回200 started/autoSubmit=false。
- 首次真实启动发现自动化父进程TERM=dumb阻挡TUI，现只从新Windows终端子进程移除这个值，保留其他环境和非dumb TERM。真实终端显示Codex欢迎/登录菜单，隔离CODEX_HOME未登录，停在认证界面，不选择登录、不传凭据、不发模型任务。
- 目录移走时UI返回400“Directory is unavailable”；junction替换OtherProject返回409“redirected”，未创建对应测试终端。启动验收只关闭精确匹配临时工程的本次进程，原有Codex进程均仍在。Windows console PrintWindow未提供图像，证据采用独立原生process/cwd/commandline/console-buffer JSON与真实按钮成功/错误/junction截图；截图已实际查看，不把网页反馈单独当作进程启动证据。

最终 `pnpm.cmd build` exit0；`pnpm.cmd test` 1109 passed、1原有skip、0failed、123files（core123、CLI855、web39、widget54、site38）。本地安全回归6领域+7usage+9项目通过，Windows Launcher及控制中心原160/280统计、复制、语言、文件传输、原Dashboard回归通过。一次验收工具把全机新增Codex PID误当额外终端，已改为精确临时目录范围，同时保留原400/409/无测试终端断言与既有进程保留检查；没有放宽产品断言。

实际服务PID48048加载修复，127.0.0.1:3847；新旧真实今日tokens仍一致；HUD42052保留。本轮不实现会话元数据或云传输。证据在仓库外：`launcher-real-verification.json`、`launcher-button-feedback.png`、`launcher-error-feedback.png`、`launcher-junction-rejected.png`、`review-fixes-full-build.log`、`review-fixes-full-tests.log`、`review-fixes-control-gui.log`、`review-fixes-live-readiness.json`。未上传测试export/截图/DB/真实内容。
