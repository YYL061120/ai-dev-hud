# 账号额度审查最终证据（2026-10-03 UTC）

Implemented:
修复提交 `1945e13f8e390b77359cb640ba746390e6a1bf56` 包括账号归属未确认时未知降级、跨进程 Claude 临界区比较/原子替换、非法桶拒绝，以及短时 stdio 查询、费用缺失和完整模型分组。不是宣称真实账号额度已经完成接入。正式 API 未输出未绑定窗口，正式 UI 不画假百分比。

用户后续要求的官方协议核对已实际执行。Codex 0.154.0 官方 executable 的 `app-server --listen stdio://` 同一连接依次 initialize（95 ms）、account/read refreshToken=false（101 ms）、account/rateLimits/read（372 ms）、再次 account/read refreshToken=false（376 ms）；返回 2 个窗口，stdin EOF 后 exit0，总计 392 ms。没有权限、认证、接口或传输失败，没有启动 thread/turn 或持久 daemon；没有读取凭据文件或保存原始身份。先前 daemon proxy 不可达是独立传输层问题，stdio 不受它阻塞。

两次实际 account 对象字段均为 type、email、planType，没有 accountId/userId/workspaceId/tenantId/id。官方 CLI 生成的 GetAccountResponse schema 中 ChatgptAccount 也只有这三项；AccountUpdatedNotification 只有 authMode、planType，没有账号 ID 或登录代际。本次 account/updated 事件为 0，不能把“没有事件”当“没有切号”的证明。随机 generation 仅存在诊断进程内，结束时失效、不落盘；它只能证明连接，不足以确认同套餐账号归属。没有把 token、email、session_id 或设备 ID 冒充代际，也没有伪造接口错误。这是当前协议在既定隐私约束下缺少可靠身份字段，而非尚未尝试 account/read。

可重复探测命令（只写字段形状、阶段时延与窗口数量，不保存身份/百分比/原响应）：

```powershell
node scripts/diagnose-codex-account-boundary.cjs <官方codex.exe> <仓库外证据.json>
node scripts/verify-subscription-review.cjs 1945e13f8e390b77359cb640ba746390e6a1bf56
```

Not completed:
真实账号登录代际接入仍未完成，需官方稳定非秘密身份或另一明确可靠集成来源。当前协议若将来补足，应按连接随机代际、账号事件及断线立即失效实现，不能复用跨会话缓存授权显示。Claude 缺可信当前账号状态，显式 session/statusline capture 可继续，但未展示其全局缓存百分比，未修改用户设置。两张参考图支持流程一次明确本机目标重试失败（Windows helper os.setxattr 缺失），目标未落地，未查看；未绕过 helper。物理鼠标与真实点击穿透仍未测。

Files changed:
实现列表见修复提交；本证据补充提交还含四份现有文档最新结论排序、本报告及只读协议探测脚本。真实诊断数据仅在仓库外，未上传原日志、源码采集、私人 DB 或凭据。

Tests:
全量 build exit0，test 1155 passed / 1 既有 POSIX skip / 0 failed，132 files。固定修复 SHA 回归通过：缺证明、A→B、登出、迟到 A；非法两桶/合法 unknown 加非法桶；两个真实进程的较新 72% 和较新空快照。旧 0cc3de8 同一回归按预期失败 available≠unknown。生产 renderer 2 组正常/reduced 测试通过，包含切号、登出、迟到旧响应不恢复圈或 bucket/reset；16 组布局及 4 组 hover 回归通过，0 pageerror。首次 UI 回归因 Escape 后指针未离开不产生 hover 事件超时，修正测试动作后通过，未忽略失败。

最终原生窗口重枚举：主屏 1220717916 scale1.5、副屏 4189372782 scale1；两个原生测试通过，窗口/rail/外侧 8 DIP shape 和不聚焦证据来自真实 Electron 加控制器指针注入，physicalDesktopInput=false，不宣称物理输入通过。Node/Electron SQLite 绑定各自正常。

正式恢复 HUD PID56816、Dashboard PID68280（3847）；auth/status 和 local/usage 均 200，subscriptionWindows=0，noUnboundQuotaPublished=true，四周期估算字段存在，设备 1。主屏偏好及 widget-settings SHA256 `0B8F01CDE4F30A02DD528CAB3F36C88010E38D23E8CCED7851C01068A8B4DCC2` 未变。

证据目录：`C:\AI-Tools\ai-dev-hud-evidence\subscription-rings`；review-fixed-commit.json、codex-account-boundary-probe.json、resident-final-api.json、review-ui/、review-layout/、review-hover/、review-native/ 及 build/test 日志。已像素查看最终 hover/panel PNG；可用合成截图 Library ID `libfile_bd9eb0826b2c8191bac4a5d77a5cc016`。

Three highest-priority manual tests:
1. 官方身份字段或可信集成补足后，真实同套餐切号/登出/迟到响应/断线必须立即失效，核对账号共享窗口 reset。
2. 用户授权 Claude 组合 statusline 后验证原输出保留、并行 capture、新空观察及 session/账号归属隔离。
3. 双屏 150%/100% 的物理跨缝、快速反向、第三目标、外侧 8 DIP 点击穿透、键盘与滚动。

本轮验证后停止，等待下一项明确授权。
