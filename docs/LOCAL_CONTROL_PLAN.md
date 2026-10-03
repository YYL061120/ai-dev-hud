# 当前追加：本地控制中心

主屏 HUD 滑出由用户验收；保留当前行为。用户新指示覆盖早期 Phase 1 后停止限制。

## 第一批

沿用 CLI loopback HTTP 的认证/同源保护，独立项目服务持久化到用户 `.aiusage`，core 提供类型，web 增加 Codex Home。用户显式输入目录才登记/发现；发现最多 200 目录、深度 3，不跟随链接。识别 `.git` / `Assets` / `*.uproject` 与约定文档；只读 Git；注销只移除登记。

本地已实际发现官方 Codex CLI 0.154.0，其 `--help` 支持交互模式及 `--cd`。启动器只由按钮触发，指定已登记目录，创建交互终端，不传 prompt、不使用 exec、不自动产生 AI 请求。任务类型只生成可预览/复制的 kickoff。New Project 仅规划入口。会话历史暂不读取原始日志；无可用稳定元数据接口时明确不可用。

验收：重复登记去重、有界发现、文档越界拒绝、Git 状态、六种 kickoff、无 prompt 启动参数、保护 API、Windows Edge 页面与语言回归。

## 第二批

沿用已解析 SQLite 记录与稳定 `state.json` deviceInstanceId；新增独立版本化 usage metadata adapter，避免侵入 parser/上游同步。显式导入导出纯用量字段；session/项目/记录标识散列，不导出 cwd/sourceFile、设备主机名、提示词、响应、文件内容或凭据。导入严格 schema、大小上限、事务与去重；本机记录优先，不重复计算回流副本。

提供本地今日/滚动7天/30天/累计、模型/设备/项目、会话/用量记录、热力日汇总和 API 等价 cost，默认无需网络。同步接口仅契约，未配置云传输。

验收：窗口日期边界、去隐私白名单、重复导入/不同设备、防无效字段/数值、UI 导入导出、完整 build/tests、原 HUD/Dashboard 回归。两批各更新状态、提交、普通 push，随后停止并列明云/会话接口等剩余决策。
