# AI Dev HUD 产品需求

AI Dev HUD 是基于 [AIUsage](https://github.com/juliantanx/aiusage) 的本地优先 AI 开发控制中心。初期工具为 OpenAI Codex 与 Claude Code；主要设备为 Windows 台式机、Windows 笔记本、MacBook。

## 本轮交付

最新追加范围：用户验收主屏滑出后要求先完成更多基本功能。当前本地控制中心分两批实现，验收与边界见 `LOCAL_CONTROL_PLAN.md`；不部署云、不自动提交 Codex 请求、不创建引擎工程。以下“本轮不实现”属于早期 Phase 1 历史限制，由新追加范围覆盖相应本地功能。

### Phase 0

个人 fork `ai-dev-hud`，记录环境和上游提交，验证安装/构建/测试/实际仪表盘及可用 provider；保留接近上游的 main，建立基线标签和开发分支，完成代理约定、需求、架构、项目状态、路线图。

### Phase 1：Windows 右边缘 HUD MVP

- 普通 overlay，不使用 Win32 AppBar，不预留桌面空间。
- 折叠态约 56 DIP 宽，贴当前/所选显示器右侧，展示 Codex 身份与今日紧凑 token 数。
- 无边框、置顶、跳过任务栏、透明且轻量。
- 展开时向左扩展，右边缘不动；展示今日 Codex tokens、近 7 天总量、已有 session/usage record 数、简单模型拆分、API 等价费用。
- `Open Dashboard` 打开已有 AIUsage 仪表盘，复用当前 checkout 的 CLI 和数据库。
- 显示器感知；折叠/展开和所选显示器在本次运行中保留，显示器参数变化后重新定位。
- 以本机日历日为“今日”，采用明日零点边界以适应夏令时。
- 未准备好数据时明确展示等待/错误，不伪装为零使用。

验收必须实际运行 Windows Electron，并记录窗口边界、显示器缩放、截图、真实数据与数据库聚合的一致性、按钮调用和仪表盘结果。通过后停止。

### 用户追加的当前范围：边缘唤起与网页语言

- HUD 默认完全隐藏；在所选显示器整个可用工作区右侧内缘 32 DIP 停留约 140ms 唤起，允许在主副屏接缝的主屏内侧停留。右侧最后 8 DIP 点击穿透，面板按钮仍可点击。离开后约 450ms 缓冲再收回；任务栏区域不触发。默认主屏，显示器选择保存并在重启后恢复，失效时回到主屏。
- 保留用户参考图的 56 DIP 窄条、配色、圆角和展开布局；动画在窗口内部裁切，避免跨到相邻屏幕。悬停不抢焦点，触发边缘保持鼠标穿透，支持动画反向、多屏 DPI、切换显示器与托盘禁用/恢复。
- Dashboard 复用现有中英文字典，提供明显的中文/English 切换，持久化偏好，检查主要导航、概览、图表、筛选、设置及数字/费用/日期格式。原始模型/provider/项目路径不翻译。
- 两项分别提交并实测，不扩展到其他产品阶段。

## 后续愿景（本轮不实现）

### Usage Dashboard

今日、7 天、30 天、累计 tokens；sessions；可获得的 messages/requests；模型/设备/项目拆分；活动热力图；API 等价 cost。保持已有 AIUsage 仪表盘，本轮不自建完整版。

### Windows Right HUD 后续

折叠宽 52–60 px，AI/provider 图标与紧凑状态；hover peek 小摘要；展开向左，含今日、周、模型、sessions/requests、cost/value、未来设备数据；后续再做自动启动与全屏自动隐藏。

### Codex Home / 新聊天页

当前项目、Unity/Unreal/其他引擎、Git 分支、dirty/clean、AGENTS.md、PROJECT_STATE.md、ARCHITECTURE.md、上次 Codex 会话与 session/context metadata。
动作：Continue Project、New Feature、Debug、Architecture、Code Review、New Project。

### Project Engine 与 Codex Launcher

识别 `.git`、`AGENTS.md`、`PROJECT_STATE.md`、`ARCHITECTURE.md`、Unity 的 `Assets/`、Unreal 的 `*.uproject`。
后续可选择项目和任务类型，生成上下文 kickoff prompt，在选定目录启动 Codex。

## 隐私

不依赖云基础设施。默认不同步提示词、AI 回复、源代码、文件内容。只有 usage/project metadata 默认有资格被用户选择同步；实际同步仍须显式启用。测试与截图只使用聚合信息，不暴露 session 正文。

## 限制

请求数仅在 provider 已提供可信语义时标作 requests；SQLite usage record 数应标为“用量记录”，不当作消息或请求。费用是 API 等价估计，不是订阅账单。原始日志保留情况会影响历史完整性。

## 已授权本地补齐验收

本地 metadata 大历史导出为单个 JSONL 分块文件，块内沿用 version 1 allowlist；保留旧 JSON 的读取/API 兼容。显示已处理块/记录，支持取消，读取进度与提交成功分开。取消、损坏文件、错误 footer、网络未确认都必须提示未完整导入和已确认前缀，允许幂等重试。默认无外部传输；选择同步方式之前不配置文件夹监控或云服务。最近会话仅允许官方安全元数据接口，当前 transport 不可达时显示来源和具体原因。
