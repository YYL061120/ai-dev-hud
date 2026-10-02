# 路线图

| 阶段 | 交付 | 本轮状态 |
| --- | --- | --- |
| Phase 0 | fork/remotes、上游安装构建测试与真实运行、基线标签、代理/产品/架构/状态文档 | 正在验证 |
| Phase 1 | Windows 右边缘 56 DIP Codex HUD、向左展开、已有数据和 Open Dashboard、Windows 实测 | 基线通过后开始 |
| 后续 | hover peek、自动启动、全屏隐藏、更丰富 usage dashboard | 本轮不实现 |
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
