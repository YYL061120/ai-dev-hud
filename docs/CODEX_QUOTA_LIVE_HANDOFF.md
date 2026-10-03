# Codex 真实额度短时核验交接（2026-10-03 UTC）

本文替代 ACCOUNT_QUOTA_REVIEW 中“缺稳定 accountID 必须永久未知”的阶段判断。后续独立审查已认可下述有界方案。

Implemented:
同一官方连接 account/read(refreshToken:false)→额度→account/read；非空 type/email/planType 一致且没有账号事件、错误或异常退出才发布。原字段仅在连接内比较，完成后清除，不日志、不落盘、不传 UI；匿名 generation 每次连接随机生成。观察 validUntil 最多 30 秒并受最早 reset 限制，缓存最多 15 秒后重验；正常查询 EOF 保留已完成观察到截止，异常断线失效。API 配套当前确认 generation，HUD/用量页每 15 秒刷新，每秒检查截止，hover 显示核验和有效至时刻。实际当前实现已查询成功：427 ms、两个 available 窗口、约 29.98 秒剩余，DTO 不含身份。

Claude capture 改用现有 better-sqlite3 BEGIN IMMEDIATE 操作系统锁保护旧快照读取/比较、写入及 rename。进程崩溃锁自动释放，不按年龄/PID抢活锁；旧目录锁不再作为获取条件，保留而不擅自删除。同毫秒空快照优先失效；入口 hrtime 为其他同毫秒观察排序，延迟旧输入不能回灌。Codex 仅校验实际选择的 map 或 fallback ID，未使用 legacy 非法 ID 不再拒绝合法 map。

Not completed:
外部切号/登出存在最多约 30 秒观察窗口，UI 截止另有不足 1 秒粒度；同邮箱/同套餐工作区变化仍有歧义，不声称瞬时一致或本机独享。Claude 缺可信当前账号状态，仅保留显式 capture，不显示全局缓存百分比、未改用户设置。两张参考 Library 图支持流程本机重试仍因 os.setxattr 失败未落地/未查看；物理桌面输入和点击穿透仍需手测。不是权限或认证阻塞，真实 Codex 已能显示。

Files changed:
CLI subscriptions/API、core subscription-usage 与测试；共用圈组/详情/本地用量页及 HUD 刷新；固定提交验证脚本和生产 TTL 回归；架构/计划/状态/交接文档。未修改 AI-usage-tracker、未引入云服务或持久身份凭据。

Tests:
全量 build exit0；全量 tests 1163 passed / 1 既有 POSIX skip / 0 failed，132 files。覆盖前后账号变化/登出/空身份/事件/异常退出/错误/身份不泄漏、随机代际、TTL、同毫秒空快照双向优先及 map precedence。生产 normal/reduced 2 组 TTL 自行失效回归通过。固定提交脚本新增真实双进程活锁不抢占、杀死持锁进程后恢复，以及同毫秒双向失效、实际 RPC 协议隔离回归；最终 SHA 结果及正式进程记录另记验证补充。

当前脱敏证据：C:\AI-Tools\ai-dev-hud-evidence\subscription-rings\codex-real-ready.json、live-ui/；其余本轮 build/test/固定提交/正式 API/原生证据在同目录。不保存原始身份、原响应或凭据。

Three highest-priority manual tests:
1. 真实外部切号/登出/工作区切换，核验有界观察时窗、失效及重新验证；不要求瞬时检测。
2. 用户授权 Claude 组合 statusline 后测试原输出、并行 capture、崩溃恢复与空快照。
3. 150%/100% 双屏物理跨缝、快速反向、第三目标及外侧 8 DIP 点击穿透。
