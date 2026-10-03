# 路线图

最新用户追加：先搭齐基本功能。第一批本地项目登记/有界发现/Codex Home/Launcher，以及第二批本地用量/安全metadata导入导出均通过自动验证。当前停止：下一步决定会话元数据正式接口、交互终端手动验收、跨设备别名与云后端、较大历史分块传输，再进行视觉深化。原阶段表保留历史，当前计划见 `LOCAL_CONTROL_PLAN.md`。

| 阶段 | 交付 | 本轮状态 |
| --- | --- | --- |
| Phase 0 | fork/remotes、上游安装构建测试与真实运行、基线标签、代理/产品/架构/状态文档 | 完成，原始失败与独立修复已记录 |
| Phase 1 | Windows 右边缘 56 DIP Codex HUD、向左展开、已有数据和 Open Dashboard、Windows 实测 | 核心验收通过，到达停止条件 |
| Phase 1 用户追加 | 边缘悬停滑入/收回、原 Dashboard 明显中英切换与持久化 | 两项独立完成，Windows GUI 与完整 build/tests 通过；停止 |
| 后续 | 更丰富 hover 摘要、自动启动、全屏隐藏、更丰富 usage dashboard | 本轮不实现 |
| 后续 | 多设备 metadata 同步与设备/项目拆分 | 本轮不实现 |
| 后续 | Codex Home / 新聊天 landing page | 本轮不实现 |
| 后续 | Project Engine / context metadata | 本轮不实现 |
| 后续 | project-aware Codex Launcher | 本轮不实现 |

## Phase 0 门禁

安装、完整构建、相关测试成功；上游原始失败和必要兼容修复分开记录；实际 dashboard 和可获得 provider 已实测；main 接近上游；文档准确。

## Phase 1 门禁与停止条件

真实 Windows Electron 窗口可见；折叠约 56 DIP；frameless/alwaysOnTop/skipTaskbar；right-edge anchoring；展开向左；今日 Codex 数据与现有 SQLite/API 一致；Open Dashboard 可用；原 AIUsage 功能回归通过；完整 build/tests 通过；状态文档与证据更新后停止。

## 隐私前提

本地离线核心功能无需云。默认不上传 prompts、responses、source code、file contents。metadata 同步须用户显式选择，后端可替换。不可因 later phase 愿景提前增加账号或云依赖。
