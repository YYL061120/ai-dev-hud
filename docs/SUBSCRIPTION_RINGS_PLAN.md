# 工具套餐同心环：本地实现与真实额度边界

本阶段起点 `15ee57f`，分支 `feat/local-control-center`。按用户新授权替代旧设备 token 份额弧的呈现；保留旧 metadata 聚合、传输格式及四周期 API。禁止修改 AI-usage-tracker、provider parser、用户工具配置、凭据、云服务或启 daemon。

## 实施方案

1. Core 增加账号共享套餐观测 DTO：来源、观测时间、bucket 标识/名称、实际窗口分钟、已用百分比、重置时间。未知百分比为 null；五分钟以上、未来时间异常或已经 reset 的观测不绘制进度。窗口不与今日/7天/30天/累计筛选联动；不对设备分配或相加。
2. CLI 独立适配器：Codex 先探测已有 daemon，成功才使用 `app-server proxy` 做 initialize 与 `account/rateLimits/read`，有超时/响应大小上限，不读取 account/auth/会话、不启动服务。Claude 可选 stdin 捕获仅保存 `rate_limits.five_hour/seven_day` 白名单到本地 `.aiusage/subscription-claude.json`；原始 payload 不写盘，不解析上下文 token，不采集凭据或实际账单。现有 OAuth quota.ts 不用于 HUD。
3. Usage API 给四周期圈快照附加同一账号观测；不放进 metadata 导出、不修改 usage DB、不改变导入去重。模型/设备用量继续从既有解析与聚合得到。
4. 共用组件默认以设备图标加工具同心环显示；Claude Code 橙色、OpenAI/Codex 白色，新增工具向外扩展。只有本机所观测账号有官方有效数据时才画弧，导入设备不复制本机账号额度。虚线表示未知/过期，真实零百分比可显示；没有采集设备不造身份。
5. Hover 保留固定壳、两层有界 crossfade 和间隙保持，按工具显示模型 tokens/金额/真实窗口，简短标明账号共享。周期选择在 hover 层；底部详情图标轻微放大，点击展开独立更多详情，可滚动并保留 Dashboard。金额估算含义在 tooltip/二级说明，缺失不等于零。

## 官方能力与现场可行性

- [Codex App Server 官方文档](https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt)：优先 `rateLimitsByLimitId`，兼容 `rateLimits`；bucket 不是模型，primary/secondary 不硬编码为5h/7d。环选择通用 bucket 的最长实际窗口；多个非通用 bucket 无安全单值时不画合计。
- [Claude statusline 官方文档](https://code.claude.com/docs/en/statusline#rate-limit-usage)：Pro/Max 等支持套餐在首次 API 响应后可能提供五小时/七天窗口，字段可独立缺失。`context_window.used_percentage`、`cost.total_cost_usd`、网关 `spend_limit` 均不是个人套餐分母。
- 实测 Codex `0.154.0` 支持 proxy/daemon version 命令，但现有 control socket 不可连接。本轮不启 daemon，真实 Codex 百分比未知。Claude `2.1.284` 安装存在；本轮未修改其 statusline 设置、未请求新响应，真实额度亦未接入。

## Claude 最小可选接入（本轮只提供，不自动设置）

在用户已有 statusline 脚本取得官方 stdin JSON 后，把同一份输入传给以下本地命令；原来的 statusline 渲染继续由原脚本完成，不把该命令当作原输出的替代：

```powershell
# $statuslineJson 是已有脚本刚收到的官方输入；此处不包含凭据。
$statuslineJson | node C:\AI-Tools\ai-dev-hud\packages\cli\dist\index.js capture-claude-limits
```

没有原脚本或需要配置新 statusline 时，先由用户选择接入方式；不得覆盖其现有配置。捕获无 `rate_limits` 的输入会清除旧窗口；CLI/HUD 每次刷新读取本地白名单快照，过期回到未知。该适配器不触发模型请求，不会重复累计 tokens。

## 验证范围

运行完整 build/test，以及 `verify-hud-hover.cjs`、`verify-ring-layout.cjs`、`verify-subscription-rings.cjs`、`verify-hud-native-bounds.cjs`。前三者为生产组件+合成数据/浏览器指针；后者为真实 Electron/显示器与控制器注入。物理桌面 pointer、真实背景点击投递与实际账号额度端到端仍须分别验收，不能用模拟替代。

两张用户参考 Library 图片必须按官方 materialization 流程读取；本机官方 helper 在 Windows 缺少 `os.setxattr`，下载未完成，不绕过。新版生产截图仍须实际查看并记录本机证据。
