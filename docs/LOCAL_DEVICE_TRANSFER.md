# 现有多设备接入方式与后台采集边界

审查修正：macOS/Linux 自动文件夹写入目前明确拒绝启用，安全目录句柄适配器尚未完成；以下无界面本机采集与手动 metadata JSON/JSONL 传输仍可用。当前限制见 SYNC_SETUP 顶部，不据此前MVP说明放行真实三机自动同步。

2026-10-04 更新：自动文件夹同步现已实现，见 [SYNC_SETUP.md](SYNC_SETUP.md)。以下手动传输保持可用；末尾“尚未实现”为本阶段之前的说明，真实三机自动同步仍未验收。

本页只说明现有代码及后续建议，未新增自动传输、云账号或 Mac 服务。其他 Windows 可运行同版本仓库 HUD/CLI；Mac 不需要 HUD 或插件，Node CLI 可以独立解析本机来源。当前 HUD 模式明确仅 Windows，Mac 后台流程未在真实 Mac 验收。

## Mac 只采集与导出

需要本仓库 feat/local-control-center 对应版本，Node >=20、pnpm@9.15.0。不要假定公开 npm 的同版本号含本分支本地控制功能。

```sh
pnpm install --frozen-lockfile
pnpm --filter @aiusage/core build
pnpm --filter @aiusage/web build
pnpm --filter @juliantanx/aiusage build
node packages/cli/dist/index.js parse --tool codex --no-progress
node packages/cli/dist/index.js parse --tool claude-code --no-progress
node packages/cli/dist/index.js serve --host 127.0.0.1 --port 3847
```

serve 不需要打开浏览器窗口。尚未配置自动刷新时可由用户明确安排 parse 或本机 POST /api/refresh；不要 init 云同步、复制凭据或把监听地址改到网络上。

小历史（最多 10 MiB / 50,000 条）可从本机服务取得 metadata JSON：

```sh
curl --fail http://127.0.0.1:3847/api/local/usage/export -o ai-dev-hud-usage-metadata-v1.json
```

大历史 JSONL 先创建 job，复制返回的 id 后下载；GET file 启动流式导出，文件必须含 complete 尾行：

```sh
curl --fail -X POST http://127.0.0.1:3847/api/local/usage/export-jobs -H 'Content-Type: application/json' --data '{}'
curl --fail http://127.0.0.1:3847/api/local/usage/export-jobs/JOB_ID/file -o ai-dev-hud-usage-metadata-v1.jsonl
curl --fail http://127.0.0.1:3847/api/local/usage/export-jobs/JOB_ID
```

以上命令对应未启用 Dashboard 密码的本机默认配置。若已启用密码，使用现有已认证本地界面完成，不建议把密码放进命令行。

## Windows 汇总

用用户选定的媒介将导出文件送到 Windows，在本地用量页选择导入 JSON/JSONL；无需复制 private DB、state.json、provider 原始日志或账号 settings。

小 JSON 也可由已授权本机客户端 POST /api/local/usage/import；PowerShell 用 curl.exe 避免 alias：

```powershell
curl.exe --fail -X POST http://127.0.0.1:3847/api/local/usage/import -H 'Content-Type: application/json' --data-binary '@ai-dev-hud-usage-metadata-v1.json'
```

大 JSONL 不是单个 JSON 请求；现有网页分块校验 header/每批 transfer/complete，再逐批调用 import。CLI 当前没有 metadata JSONL import 子命令。现有 CLI export 命令是另一种原始 records 导出，含更多身份字段，不能替代上述 metadata 接口。

state.json 提供每台机器稳定身份；metadata 导出只包含散列设备/记录/会话/项目标识及汇总字段。不要跨机复制身份文件。导入按设备+记录去重；更大 updatedAt 更新，同版本相同内容重复，同版本不同内容报告冲突；本机 parser 记录优先。导入设备不共享本机 Claude/Codex quota 或账号身份。现有传输不会自动删除接收端历史，也不自动合并设备或项目。

## 后续方案，尚未实现

如果用户希望全自动，可另立明确授权里程碑：Mac headless collector 复用 CLI 与 provider parser，定时生成白名单 metadata；replaceable transport 只运送 metadata 到 Windows，由现有验证/去重入口接收。用户需先选择传输媒介（局域网、受控共享目录、SSH/SFTP 等）与触发频率，再设计认证、重试、版本、失败状态及设备失活提示。不要直接把现有上游云 sync/leaderboard 当作这条 metadata 链路，也不需要先安装“读取所有信息”的插件。
