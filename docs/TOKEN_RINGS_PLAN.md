# 用量圈与参考交互实施计划

用户授权在现有右侧 HUD 和 local-usage 页面实现统一用量圈。参考视频已由父任务实际观察：近黑大圆角槽、细环/灰底轨/居中自有图标/外置紧凑数字，单一随悬停切换的明细浮层；保留已有右边缘唤起，不复制顶部 dock、品牌资产、未知配额或回本倍数。

1. core 定义 typed rings snapshot，复用本机+手动metadata同一去重路径及本地自然日范围；总圈为总量标识，设备弧为同周期已采集总量占比。无分母时无占比。未接入独立说明，不生成设备ID或零用量。按真实tool/provider/model提供token和已知估值；未知/部分估值明确表达。新导入接收时间单独存于本地receipt表，历史缺失保持unknown，不加入导出。
2. web/widget共用Svelte圈组，SVG细环、数值插值、transform/opacity浮层，一次一个；键盘/触控、Escape、快速反向、减少动态效果和页面不可见时停止动画。窄HUD显示总圈与设备圈，点击进入原左向展开；展开支持today/seven/thirty/lifetime，按钮可见且不被常驻浮层遮挡。
3. HUD通过loopback现有/api/local/usage取得typed snapshot，经main/preload传入renderer；数据parser不变，不叠加synced_records。保留原Codex本机统计供回归核对；四周期缓存/刷新由原有更新节奏驱动，不逐帧请求API。
4. 合成数据验证多设备/旧历史/无数据/重复导入/来源时间/缺失估值/日期与sum；实际Windows Edge/Electron查看截图、细节切换、键盘触控、帧间隔/长任务/隐藏后空闲、混合DPI和现有HUD唤起。本机实测仅一台设备，不宣称笔记本/MacBook已接入或视频级帧率。

分domain/API与UI/验证提交；完成完整build/tests、真实实例检查和状态文档后停止。未授权外发数据、云部署或自动同步。

## 独立复核收尾与可重复验证

网页明细打开期间缩窗的位置重算，以及HUD多行设备圈的明细/footer空间已修复，详见PROJECT_STATE最新章节。只涉及共享圈组件与HUD呈现，未改领域语义或边缘行为。

完成根构建后，用实际生产组件运行回归脚本；Playwright可来自现有工具环境，无需给产品增加依赖。Windows本机示例：

```powershell
$env:AI_DEV_HUD_PLAYWRIGHT_PATH='C:\AI-Tools\.ai-dev-hud-tools\node_modules\playwright'
$env:AI_DEV_HUD_LAYOUT_EVIDENCE_DIR='C:\AI-Tools\ai-dev-hud-evidence'
node scripts\verify-ring-layout.cjs
```

可用AI_DEV_HUD_BROWSER_PATH指定Chromium；Windows默认使用已安装Edge。脚本创建独立空CLI配置，用core真实领域API生成合成snapshot，不读取用户日志。覆盖打开卡片后420/320/280宽度、两档deviceScaleFactor、3/4/8/12设备的每一个圈、保持焦点/单明细、按钮可见/中心命中/回调。通过不等同于真实电脑均已接入；双屏原生Electron验收另有本机证据。
