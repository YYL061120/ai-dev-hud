# AI Dev HUD 项目交接：悬停明细与连续动效

交接日期：2026-10-03 UTC。用户要求转到新的项目任务聊天，当前任务在文档边界暂停。这里记录项目事实、授权目标与待验证方案，不是已完成的新交互。

## 目标与范围

用户反馈右侧滑动唤起不够丝滑，鼠标停在圈上不会自然圆润展开使用量明细；希望尽可能还原参考视频的交互逻辑与动效。已授权继续优化代码、必要测试、正常commit/push。保留主屏右侧HUD，目标路径为边缘→窄槽→悬停明细→圈间内容切换→移入卡片→离开收回，无需先点击才出现明细。不扩大到云同步、虚构设备/额度/回本、顶部dock或无关产品阶段。

新参考：https://www.xiaohongshu.com/discovery/item/6aa5a806000000002502f8ac 。本轮网页工具无法访问，尚未取得其内容；逐段视觉观察要点待在新任务补齐。不要把下方初步方案称为视频精确还原，也不要臆造其时长、缓动或帧率。

## 仓库与最近完成的工作

- C:\AI-Tools\ai-dev-hud；不要修改C:\AI-Tools\AI-usage-tracker。
- origin：https://github.com/YYL061120/ai-dev-hud.git；upstream：https://github.com/juliantanx/aiusage.git。
- 分支feat/local-control-center，不在main开发。
- 当前产品提交44e148fed7c8a0c3536a73693180898a87de6b00，已正常推送，独立核对远端一致。main仍85b86874f579f4627456de89b102f016d489ce27；baseline-aiusage指向508aa09a4af3310585fef71955be196a523aad05。
- 上轮已修网页明细打开后1280→420越界，以及4台设备使HUD明细遮挡Dashboard。ResizeObserver重定位；HUD圈槽104 DIP滚动、明细参与内容流、summary-scroll与footer分离。不能在动效优化中回归这些修复。
- 四周期领域API、设备去重、日期/sum/DST/未知费用来源已验收，provider parser不改。真机仅一台本机，额外设备是明确合成验证数据。
- 本轮交接前工作树干净，没有新产品代码修改、没有在运行的测试写入；仅新增本HANDOFF并更新PROJECT_STATE。最终Git状态和文档提交请用git status / git log核对。

## 当前实际运行状态（只读核对，未重启）

- 正式HUD PID59724，命令为本仓库Electron33.4.11运行packages/widget/dist/main.js --hud。
- Dashboard PID68272：Node运行packages/cli/dist/index.js serve --port3847；http://127.0.0.1:3847/api/auth/status返回HTTP200。
- HUD原生窗口本次读取时hidden；物理bounds Left3276 / Top642 / Right3840 / Bottom1446，对应主屏150%下376×536 DIP，说明当前会话保留展开尺寸。不要假设开始时一定是折叠态。
- 主屏1220717916（AW2725QF，150%）；副屏4189372782（KB220Q H2，100%）。主屏workArea DIP为0,0,2560,1392。
- C:\Users\30493\.aiusage\widget-settings.json SHA256保持0B8F01CDE4F30A02DD528CAB3F36C88010E38D23E8CCED7851C01068A8B4DCC2。
- 没有停止用户Codex会话、改变持久显示器设置、导出真实metadata或拍摄本轮真实用量截图。测试后必须恢复正式launcher的新常驻实例和原主屏设置。

## 已确认的源码断点

1. **窄态圈根本不响应悬停明细。** Hud.svelte的rail圈组件传detailsEnabled=false；UsageRings.open先返回。只有activate的click分支dispatch select，HUD收到select后才setExpanded(true)并设置明细key。即使HUD已展开，右侧rail仍有同样点击门槛。对应用户最直接的反馈。
2. **展开时几何突变。** main.ts的hud:set-expanded立即positionHud；getHudBounds把原生窗口56×216改成376×536并重新垂直居中，没有形状/大小过渡。原中心相同，但顶部上移160 DIP；rail随整个窗口上移、可用高度也突变，光标原本指向的圈会位移。Hud.svelte仅按reveal平移整个main，并通过if expanded瞬时挂载summary；这不是一条连贯的窄槽到明细动画。
3. **动画时钟未与渲染帧同步。** main用visible16ms / hidden40ms timeout采样鼠标、解spring后每步IPC发送reveal；renderer收到后直接改transform。实际合成层更新节奏是否抖动仍需连续视觉测量，不能仅凭页面rAF统计宣布流畅。
4. **圈间明细切换没有连续内容/位置过渡。** 单一detail只有首次挂载/卸载的fly(y=-5,duration150ms)。activeKey更换时同一section内容及色值立即替换，popupLeft/指针位置也是立即赋值；没有高度/圆角/位移协调，也没有可中断的内容过渡。
5. **两个组件的保持区没有统一。** summary与rail各有自己的圈组件；summarymouseleave会在140ms清空明细，而rail hover因为detailsEnabled=false不会激活/保持同一个明细。native整体离开缓冲450ms与组件关闭140ms是独立策略；圈→卡片→rail路径可能提前关闭或重开，需真实鼠标验证。网页同root的11px间隙已有缓冲，不应未经复现就宣称所有间隙都有bug。
6. **减少动态效果只覆盖部分呈现。** UsageRings监听prefers-reduced-motion，停数字/SVG插值、fly duration0；native HudHoverController尚无reduce输入，边缘spring仍运行。后续应形成完整策略，保留功能和命中范围。

以上是源码与实际原生窗口只读检查所得。尚未对本轮反馈执行连续真实鼠标复现、录制或视觉验收；不要将旧测试或诊断推断写成新交互通过。

## 下一步方案（待参考观察确认后实施）

1. 先用隔离合成fixture与真实用户profile分别复现完整路径，记录窗口/DOM几何、hover目标、activeKey、卡片是否可达与关闭原因；把此前“必须点击”的负例固定下来。
2. 收齐新视频观察后，用明确hidden / rail / hover-detail / explicit-expanded状态及同一个activeKey协调生命周期。悬停/键盘焦点自然打开圈明细，触屏与点击保留可用入口；源圈和卡片共用保持区/关闭缓冲，Dashboard显式展开仍可用。
3. 让rail图标在屏幕坐标上保持稳定，明细向左圆润出现；原生窗口包络与renderer裁切/命中区域同步。可评估预留透明包络或有限几何过渡，但尚未决定，不要直接用全矩形吞掉桌面输入，也不要每帧调用解析/API或昂贵原生resize。
4. 用可中断、能反向的单一动效状态协调显隐、卡片位移/透明度/尺寸与圈间内容更新；参考缓动参数在实测后调节，不宣称视频精确值。隐藏后停止动画工作，减少动态效果立即或轻量切换。
5. 保留32DIP主屏全右缘感应、外侧8DIP点击穿透、不抢焦点、正确DPI坐标转换和托盘显示器设置。若为参考体验调整延时，须更新对应测试与文档，用实测理由说明。当前旧常量为140ms唤起/450ms离开；无需把它们当作视频要求。
6. 最小呈现/控制器修改，typed数据基础不改。更新AGENTS当前范围与PROJECT_STATE，build/tests、连续视觉与真实原生路径验收后再提交/推送、恢复常驻。

## 验证要求

- 实际原生鼠标从边缘进入窄圈，不点击即可出现对应明细；停留、慢移/快移到卡片仍保留，跨圈连续切换，离开自然收回。包含初始expanded=false和已展开两态。
- 每屏100%/150%与动画中换屏；反向中断/快速返回、减少动态效果、键盘Tab/Escape/焦点保留、触屏点击、托盘暂停恢复、外8DIP点击穿透且面板正常点击。
- 原实际用户profile主屏上下边缘路径另测；测试鼠标归属/进程保护，不覆盖用户移动的鼠标，不停止用户Codex。真实用量只作本机核对；对外图片/录制仅用合成数据。
- 连续录制或帧序列要实际查看，记录原生bounds与DOM变化/卡片位置连续性、呈现时间间隔、长任务、IPC/API数量及隐藏空闲。rAF采样只能是辅助，不能替代用户体验验收。
- 上轮420/320/280缩窗与3/4/8/12设备、按钮不遮挡回归必须保持；原Dashboard/provider功能和四周期数值不能变化。

## 可用命令、工具与已有证据

环境Windows NT10.0.26200 / PowerShell7.6.5 / Node24.21.0 / npm11.19.0 / Git2.55.0.windows.5 / pnpm9.15.0 / GH2.102.0 / Electron33.4.11。使用.cmd，不降低执行策略。

```powershell
$env:PATH='C:\AI-Tools\.ai-dev-hud-tools\node_modules\.bin;'+$env:PATH
git -c safe.directory=C:/AI-Tools/ai-dev-hud status --short
pnpm.cmd --filter @juliantanx/aiusage-widget test
pnpm.cmd --filter @juliantanx/aiusage-widget build
pnpm.cmd build
pnpm.cmd test
$env:AI_DEV_HUD_PLAYWRIGHT_PATH='C:\AI-Tools\.ai-dev-hud-tools\node_modules\playwright'
$env:AI_DEV_HUD_LAYOUT_EVIDENCE_DIR='C:\AI-Tools\ai-dev-hud-evidence'
node scripts\verify-ring-layout.cjs
```

上轮产品44e148f：build exit0，1132passed /1原有Windows POSIX权限skip /0failed，128files；浏览器16组/62逐圈焦点，原生4/12设备双屏与真实profile均通过。仅文档交接没有重跑此完整测试。

核心入口：packages/widget/src/main.ts、hud-hover.ts、hud-window.ts、preload.ts、renderer/Hud.svelte；共享组件packages/web/src/lib/components/UsageRings.svelte。相关tests在packages/widget/tests；当前便携生产组件脚本scripts/verify-ring-layout.cjs。

仓库外C:\AI-Tools\.ai-dev-hud-tools：verify-rings-layout-native.cjs（AI_DEV_HUD_NATIVE_DEVICE_COUNT=4或12）、verify-rings-live.cjs、electron-observer.cjs、live-inspect.exe、hud-pointer.exe及源文件。原生助手执行前核对准确进程命令，鼠标坐标物理↔DIP转换与归属保护；check-rings-layout-resident.ps1硬编码PID59724，重启后必须改为新的准确PID，不能照搬旧PID。

证据在C:\AI-Tools\ai-dev-hud-evidence：RINGS_LAYOUT_REVIEW_REPORT.md、MORNING_REPORT.md、rings-layout-full-{build,tests}.log、rings-layout-regression.json、rings-layout-native-{4,12}.{json,log}、rings-layout-live-verification.json、rings-layout-restored-resident.json。已有Library图片确认ID见RINGS_LAYOUT_REVIEW_REPORT.md；均合成，属于布局验收，不是本轮连续新动效证据。

## 当前待完成与三个最高优先级手工验收

Implemented: 本轮只有诊断和项目交接文档，没有新交互实现。

Not completed: 参考观察补齐、连续真机负例复现、新悬停/动效状态机、完整验证及新版常驻恢复。

Files changed: docs/HANDOFF.md、docs/PROJECT_STATE.md（纯文档）。

Tests: 本轮只读核对实际PID/窗口/设置/HTTP200，源码阅读；无新产品测试，上一产品提交验证结果如上。

Three highest-priority manual tests:
1. 不点击，主屏右缘进入并悬停圈，确认明细圆润出现且圈的位置不跳。
2. 圈→卡片→另一个圈→离开，确认明细可读、切换连续、可反向且不闪灭。
3. 双屏DPI/减少动态效果/键盘/穿透与Dashboard，确认交互优化没有破坏旧功能。
