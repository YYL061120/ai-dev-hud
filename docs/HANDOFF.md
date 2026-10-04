# AI Dev HUD 项目交接：工具套餐同心环与独立详情

最新接续：[CLAUDE_SESSION_HANDOFF.md](CLAUDE_SESSION_HANDOFF.md)。用户真实 Claude 配置未改；UI 明确启用后保留原渲染，展示短时当前会话观测而不证明账号。预览、取消、确认、停用恢复、清除、外部冲突安全暂停均有隔离生产 E2E。build 通过，1173 passed / 1 既有 skip；固定 SHA、显示器枚举及正式进程恢复证据仅在本机。完成此轮后等待下一项明确授权。

优先修复：[QUOTA_CLOSE_FAILURE_FIX.md](QUOTA_CLOSE_FAILURE_FIX.md)，解决 proxy 提前 resolve 和 Web/HUD 刷新失败保留旧额度。与 Claude 新功能分开提交；固定源码脚本覆盖双传输同批事件、异常关闭和发布时点，六组生产 401/503/断网即时失效通过。

最新交接：[CODEX_QUOTA_LIVE_HANDOFF.md](CODEX_QUOTA_LIVE_HANDOFF.md)。后续审查认可纯内存 type/email/planType 前后比较；真实 Codex 已可发布随机观察代际及最多 30 秒 validUntil，15 秒重验，UI 每秒失效。此前永久 unknown 结论已替代；外部切号延迟和同邮箱/套餐工作区歧义仍明确保留。原身份不日志/落盘/传 UI。SQLite OS 锁取代目录锁解决崩溃恢复，同毫秒空快照失效优先，合法 map 忽略未用 legacy 非法 ID。完整实测与未测见最新交接。

固定修复 SHA af92b55b9bebe0829731964f15cfdeee7bad434c 的所有隔离回归通过，包括活锁不抢占和真实进程死亡后恢复。正式 API 与生产页面实际显示且 24 秒内更新观察代际；HUD29708、Dashboard49812/3847 已恢复、主屏偏好与设置 hash 不变。完整证据和不足见最新交接，后续等待独立复查。

## 最新交接：审查修复后的保守额度边界（2026-10-03 UTC）

最终事实、固定修复 SHA、官方账号协议探测字段及正式恢复信息见 [ACCOUNT_QUOTA_REVIEW.md](ACCOUNT_QUOTA_REVIEW.md)。stdio 同连接前后 account/read 与额度查询均成功；未知原因是缺稳定非秘密账号字段，不是权限/接口不可用。随机连接 generation 不能替代账号证明。

下方 stdio 查询及旧 available 记录为历史阶段。当前正式 readSubscriptions 清空未绑定账号登录代际的窗口；UI 同时检查 observation.generation 与 snapshot.subscriptionGenerations，任何缺失、切号、登出、旧响应均未知，并隐藏旧 bucket/reset。现有官方窗口数据没有足够的账号登录代际证明，未使用邮箱、设备 ID 或会话 ID 冒充。真实额度接入未完成，禁止将诊断查询成功解释为正式可显示。

已修复跨进程 Claude 写入顺序（mkdir 有界锁、入口时间、临界区比较和 rename，含新空快照）及非法 Codex bucket 碰撞（拒绝观察）。scripts/verify-subscription-review.cjs 接受完整 Git SHA，从该提交源码生成隔离模块并运行合成账号隔离、非法桶及真实双进程捕获回归。不得用工作区源码冒充固定提交结果。

全量最终 build 成功，tests 1155 passed / 1 既有 skip / 0 failed，132 files；Node/Electron SQLite 绑定构建检查通过。费用缺失不再显示零，跨 tool/provider 同名模型及五类 token 总量守恒有测试。证据目录 C:\AI-Tools\ai-dev-hud-evidence\subscription-rings；最终 UI/固定提交/正式进程信息见后续验证记录。

参考 Library 图 libfile_d68642b587a88191b0a5b21cfd0b7cfe、libfile_ba021f4620788191a5494bd47e8d79eb：官方 materialization helper 一次指定本机目录重试仍 os.setxattr 失败，目标不存在，未查看。可用合成 UI 截图 Library ID：libfile_bd9eb0826b2c8191bac4a5d77a5cc016。主屏偏好保持；物理鼠标/真实点击投递仍需手测。完成本轮后停止，等待明确下一阶段授权。

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


## 历史交接记录（当前状态以本页首节为准）

更新：2026-10-03 UTC。本轮代码、完整构建/测试、生产组件视频回归及当前可见屏的原生集成已完成；真实物理桌面路径和原主屏验收尚有阻塞。完成本轮验证后停止，等待明确下一项授权。

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

## 授权与边界

仓库C:\AI-Tools\ai-dev-hud；分支feat/local-control-center。起点3292973129417d83861206974d2ac998dfb6c26e（交接docs），上一产品44e148f。本轮正常提交/push已授权，最终版本用git log/status核对。不改main/历史、AI-usage-tracker、Codex内部配置、provider parser、云同步或引擎集成。真数据仅一台Windows，手动导入不代表在线；不造设备/配额/回本。

参考两条Reff视频：
https://www.xiaohongshu.com/discovery/item/6aa8a8a0000000002502eefb
https://www.xiaohongshu.com/discovery/item/6aa5a806000000002502f8ac
父任务逐段观察已提供：黑圆角槽从边缘连续展开；细彩环及圈下tokens；hover即开；跨圈保持一张圆角卡，壳/尖角跟随圈，内容交叉淡化；圈跨间隙到模型行保持。精确时长/缓动/帧率未知；后期镜头缩放不是组件动画。回本倍数为独立金额比，未实现或虚构。

## 当前实现

Implemented: main使用固定透明376×536 DIP画布，rail在窗口内x320/y160/56×216，沿旧中心固定；展开不再改原生bounds。renderer分离rail、摘要和compact左侧明细，悬停无需click。明细保持同一section壳，位置/宽高/尖角连续过渡；keyed内容160 ms最多两层有界交叉淡化（详见上述P2复核），壳首次/退出240 ms，移动280 ms。native临界阻尼保留反向速度，renderer补40 ms连续平移，仍保留32 DIP/140 ms与外侧8 DIP；离开缓冲本轮改220 ms。卡片和rail联合区域保留，原生透明孔洞中的间隙由typed detailBridgeHeld通知取消关闭。setShape只保留画面矩形/尖角，透明背景和8 DIP由原生孔洞保护；实际Windows点击投递仍待手测。reduced-motion覆盖数字/弧/壳/尖角/原生reveal。HUD和网页共用typed UsageRings，原摘要、多设备footer、窄屏ResizeObserver、中英与历史传输保留。暂时断开屏的回退不覆盖记住的显示器ID，重新接入可回到原选择。

Files changed: packages/web/src/lib/components/UsageRings.svelte；packages/widget/src/{hud-hover,hud-window,main,preload}.ts、renderer/Hud.svelte；widget/tests/{hud-hover,hud-window}.test.ts；scripts/verify-hud-hover.cjs、verify-hud-native-bounds.cjs；docs/HANDOFF.md、PROJECT_STATE.md、ARCHITECTURE.md。

## 已验证与证据

Tests: pnpm.cmd build exit0；pnpm.cmd test exit0，1135 passed / 1既有Windows POSIX skip / 0 failed，128 files。新增3条有意义的单测验证稳定canvas/rail、detail保留及透明点击范围、reduced-motion dwell。

生产renderer连续浏览器pointer路径：4组（deviceScaleFactor1/1.5×正常/reduced）通过。hover无需click；圈→12 DIP gap停留500 ms→卡→模型行→另一圈；同section持续、真实old/new内容opacity重叠、9帧壳位置/尺寸；快速反向与返回取消关闭；Tab/Escape、compact最后设备可达；展开/收起rail不移动；Dashboard回调。4份webm与9帧PNG，合成数据。保留网页1280→420→320→280及HUD3/4/8/12设备的16组/62圈布局验收。

真实Electron原生集成：当前仅枚举KB220Q H2（4189372782，100%，workArea0,0,1080,1872）。实际窗口展开前后bounds均x704/y668/376×536；rail均窗口内x320/y160/56×216；shape成功、outer8 DIP排除、注入指针的孔洞走廊保持、不抢focus。这是实际窗口+控制器注入，不是物理桌面鼠标测试；不能冒称真实混合DPI。一次测试把模拟指针留在已关闭卡的位置导致正常220 ms收回，已修测试为圈槽收起路径并通过。

本机证据在C:\AI-Tools\ai-dev-hud-evidence：HOVER_INTERACTION_REPORT.md；hover-{build,tests}.log；hover-continuity.json；hover-native-bounds.json；hover-restored-resident.json；hover-path-{1,1.5}-{motion,reduced}.webm；hover-switch-{0..8}.png；rings-layout-regression.json。本轮private数据/视觉/日志不commit。

## 常驻恢复与未验证

正式旧HUD59724已停止，正常launcher已启动最新HUD47124。原主屏偏好1220717916和设置SHA256 0B8F01CDE4F30A02DD528CAB3F36C88010E38D23E8CCED7851C01068A8B4DCC2已精确恢复；因主屏当前不可见，实际回退100%屏。Dashboard3847/api/auth/status HTTP200，不重启用户Codex或启daemon。

Not completed: 150% AW2725QF主屏当前未被系统枚举；真实主屏/混合DPI切换、常驻实际rail/window bounds、物理pointer连续路径和背景click-through投递未实测。已读computer-use技能及guidance/confirmations；工具未提供必须的node_repl/@oai/sky入口，未使用自制Win32输入工具绕过限制。浏览器缩放/原生100%/纯函数DIP测试不能替代这些项目。视频只能证明生产renderer合成路径；不声称完全还原参考视频或所有完成标准已验收。

Three highest-priority manual tests:
1. 主屏恢复后边缘→圈→间隙→卡片模型行→另一圈，快速来回与动画中反向，检查shell/尖角/内容和rail视觉位置。
2. 实际150%/100%换屏、断开/恢复主屏，核对持久选择、不focus、外侧8 DIP和透明背景点击落在后方窗口。
3. reduced-motion、键盘Tab/Escape、四周期/真实设备来源；中英网页窄屏、Dashboard以及大历史导入/导出保持可用。

复跑：PATH加入C:\AI-Tools\.ai-dev-hud-tools\node_modules\.bin；使用pnpm.cmd。脚本指定AI_DEV_HUD_PLAYWRIGHT_PATH=C:\AI-Tools\.ai-dev-hud-tools\node_modules\playwright，以及AI_DEV_HUD_HOVER_EVIDENCE_DIR/AI_DEV_HUD_LAYOUT_EVIDENCE_DIR。node scripts/verify-hud-hover.cjs；node scripts/verify-hud-native-bounds.cjs；node scripts/verify-ring-layout.cjs。前两脚本只合成数据，后者隔离CLI。Computer Use恢复后才继续真实桌面验收，之后不开展新里程碑。
