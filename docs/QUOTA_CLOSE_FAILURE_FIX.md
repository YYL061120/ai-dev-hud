# 额度关闭与刷新失败修复（2026-10-04 UTC）

Implemented:
修复固定 78f2172 复查的 P1/P2：proxy 与 stdio 共用 EOF/正常 close 后发布路径；完整处理同批账号事件，异常退出、超时或强制 kill 不保留有效观察。刷新失败立即用 typed domain invalidateSubscriptionSnapshot 清空额度和代际，保留原有设备/模型/tokens 历史；Web 与 HUD 均处理，不等待 30 秒 TTL。

Not completed:
Claude 新功能独立开发，未包含在此修复提交。物理桌面输入仍未验证，真实用户切号不声称瞬时检测。

Files changed:
CLI subscriptions 的 proxy 关闭路径及双传输测试；core usage-rings 的明确失效接口；Web local-usage 刷新/HUD renderer；固定源码验证脚本及生产失败回归脚本；本报告和状态/交接引用。

Tests:
当前工作区全量 build 成功、1165 passed / 1 既有 skip / 0 failed，132 files。工作区包含尚未提交的 Claude 功能文件，修复提交单独暂存并检查，不冒充其全量构建来自隔离 checkout。生产 verify-quota-failures.cjs：Web/HUD × 401/503/断网六组立即 unknown、arc=0、tokens 保留，0 pageerror。固定提交脚本已扩展 proxy+stdio、同一 stdout 批次账号事件及关闭前不得发布断言；提交后的完整 SHA 结果另记最终交接。首轮回归选择器和数字动画断言失败均已修正为实际 DOM/领域值后通过，未跳过失败。

Three highest-priority manual tests:
1. 实际 daemon proxy 查询的 EOF、登出事件及异常退出不得泄漏有效额度。
2. 正式 Web/HUD 认证失效、服务停止和断网立即清额度，恢复后重新核验。
3. 双屏物理跨缝与外侧 8 DIP 点击穿透。
