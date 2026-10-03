# AI Dev HUD 项目交接：悬停明细与连续动效

更新：2026-10-03 UTC。本轮代码、完整构建/测试、生产组件视频回归及当前可见屏的原生集成已完成；真实物理桌面路径和原主屏验收尚有阻塞。完成本轮验证后停止，等待明确下一项授权。

## 授权与边界

仓库C:\AI-Tools\ai-dev-hud；分支feat/local-control-center。起点3292973129417d83861206974d2ac998dfb6c26e（交接docs），上一产品44e148f。本轮正常提交/push已授权，最终版本用git log/status核对。不改main/历史、AI-usage-tracker、Codex内部配置、provider parser、云同步或引擎集成。真数据仅一台Windows，手动导入不代表在线；不造设备/配额/回本。

参考两条Reff视频：
https://www.xiaohongshu.com/discovery/item/6aa8a8a0000000002502eefb
https://www.xiaohongshu.com/discovery/item/6aa5a806000000002502f8ac
父任务逐段观察已提供：黑圆角槽从边缘连续展开；细彩环及圈下tokens；hover即开；跨圈保持一张圆角卡，壳/尖角跟随圈，内容交叉淡化；圈跨间隙到模型行保持。精确时长/缓动/帧率未知；后期镜头缩放不是组件动画。回本倍数为独立金额比，未实现或虚构。

## 当前实现

Implemented: main使用固定透明376×536 DIP画布，rail在窗口内x320/y160/56×216，沿旧中心固定；展开不再改原生bounds。renderer分离rail、摘要和compact左侧明细，悬停无需click。明细保持同一section壳，位置/宽高/尖角连续过渡；keyed内容120/160 ms交叉淡化，壳首次/退出240 ms，移动280 ms。native临界阻尼保留反向速度，renderer补40 ms连续平移，仍保留32 DIP/140 ms与外侧8 DIP；离开缓冲本轮改220 ms。卡片和rail联合区域保留，原生透明孔洞中的间隙由typed detailBridgeHeld通知取消关闭。setShape只保留画面矩形/尖角，透明背景和8 DIP由原生孔洞保护；实际Windows点击投递仍待手测。reduced-motion覆盖数字/弧/壳/尖角/原生reveal。HUD和网页共用typed UsageRings，原摘要、多设备footer、窄屏ResizeObserver、中英与历史传输保留。暂时断开屏的回退不覆盖记住的显示器ID，重新接入可回到原选择。

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
