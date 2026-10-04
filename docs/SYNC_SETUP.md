# Google Drive 本地用量文件夹同步

只实现用户明确选择的本地文件夹传输，不调用 Google 账号 API、不修改 Drive 配置，不复制 SQLite、state.json、原始日志或认证。默认关闭。真实 Google Drive 目录、Mac 和另一台 Windows 未由代理访问；用户报告三机 hello 文件一致，只证明媒介可用。

## 各机准备与目录

使用本分支本地版本，Node >=20、pnpm@9.15.0。当前提交未 push，其他机器需用户自行通过授权方式取得代码；公开 npm 包不能替代本轮代码。各机保留独立 `~/.aiusage`（Windows 为用户目录下 `.aiusage`），禁止跨机复制 state.json/cache.db。首次启动生成随机稳定设备 ID，writer 使用另一个随机 UUID。

三机分别选择同一个云文件夹对应的本地路径；空格正常支持。文档使用 `<桌面本地同步目录>`、`<笔记本本地同步目录>`、`<Mac本地同步目录>`，不记录真实路径或邮箱。确认 Drive 已离线下载。目录必须存在，不得包含私人数据库、`..`、symlink/junction 或 realpath 重定向的祖先。无权限时由用户在应用正常权限下处理，功能不绕过访问限制。

## Windows：采集与 HUD 汇总

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
node packages/cli/dist/index.js serve --host 127.0.0.1 --port 3847
```

在本机网页 `/local-usage` 输入本机目录，点击“确认目录并启用脱敏同步”。自动采集、发布本机增量、合并他机 metadata；可暂停、立即同步，查看最后成功补扫/错误/下一次补扫/设备最后收到时间。最后收到表示文件到达，不证明在线。HUD 消费同一个现有 usage API，既有启动方式、动画和四周期不变。

应用必须持续运行。没有自动安装任务计划、登录启动或系统服务。已有常驻 Dashboard 需用户正常关闭并启动本轮代码后才能看到入口；代理未重启真实用户服务、未配置真实目录。

## Mac：仅无界面 collector

```sh
pnpm --filter @juliantanx/aiusage... install --frozen-lockfile
pnpm build:collector
node packages/cli/dist-collector/index.js folder-sync --help
node packages/cli/dist-collector/index.js folder-sync --status
node packages/cli/dist-collector/index.js folder-sync --directory '<Mac本地同步目录>' --enable --once
node packages/cli/dist-collector/index.js folder-sync --watch
```

替换占位符；单引号仅为 shell 引号。不构建 Electron，不打开浏览器，独立产物不覆盖 Windows Dashboard。collector 复用现有 Codex/Claude Code 增量 parser，不优化 Cursor、不启 daemon、不请求账号云 API。`--enable` 明确确认写脱敏数据；`--watch` 仅在已启用后运行。Ctrl+C 停当前进程，保留持久配置。持久暂停和手动运行：

```sh
node packages/cli/dist-collector/index.js folder-sync --pause
node packages/cli/dist-collector/index.js folder-sync --once
```

暂停时 `--once` 不读写同步目录，`--status` 不输出私人目录路径。Windows 同样支持 CLI，可用 `dist/index.js`。构建、CLI 选项及空来源采集已在 Windows 隔离 profile 验证。安装命令根据仓库锁文件/依赖过滤核对，没有重装现有依赖；真实 Mac 的安装、原生 SQLite 构建、File Provider 权限、实际来源采集和睡眠恢复未实测。

若需登录启动，由用户自行预览并创建：Mac LaunchAgent 的 ProgramArguments 为本机 Node 绝对路径、collector index.js 绝对路径、`folder-sync`、`--watch`，WorkingDirectory 为仓库，RunAtLoad 可启用；不要未启用同步就无条件 KeepAlive 重启。Windows 任务计划用普通用户权限、登录触发、本机 Node `serve` 和仓库工作目录。本轮没有安装任何持久任务。

## 协议和恢复约束

- 外部目录只写已有 version 1 allowlist JSONL（header/transfer/complete）。每批最多 1000 记录、每行最多 2 MiB；每 15 分钟发布一次零记录完整心跳。文件名仅含散列 deviceKey、随机 writer/batch UUID。
- 独占创建同目录临时文件、flush、rename 后成为不可变批次；接收端忽略 `.tmp`，整文件校验完成尾行/大小/设备后才事务导入。云端传输仍可能半下载，需后续补扫。
- 不含 prompts/responses/source contents、绝对项目路径、邮箱、hostname、真实 session ID、凭据、quota 或账号 snapshot。配置路径、绑定散列、摘要账本、收据/检查点/lease 只在本机私人 SQLite。
- 仅导出当前设备 local-origin 记录；防自己导入自己、防他机循环再导出。设备+记录去重，变化记录推进单调传输 updatedAt 修订，旧 parser 更新时间未变化的更正和重新估价也能传播。同版本冲突保留已有值并报告。
- 不可变批次被改写时拒绝重新导入；带冲突副本后缀的文件按内容去重。未知字段、过大文件、半写入、未下载、损坏、身份冲突不删除源文件，不阻断其他健康文件。修复未完成批次后补扫重试。
- 60 秒定时补扫，不依赖 watcher。目录级失败指数退避至最多 15 分钟。每轮最多检查 128 文件、扫描 50×1000 本机记录，传输部分预算 30 秒；持久轮转避免坏文件/老文件饿死新文件。完整核对可能跨多轮，成功时间表示补扫轮完成。目录上限 10000 项，超过时提示用户归档，程序不自动清理云历史。
- 暂停/停止在批次发布前及异步边界生效，读取其他进程的持久暂停。现有 parser 单次采集无法中途抢占，暂停等待它返回；30 秒预算从采集后开始。私人 DB lease 防同机双进程同步，崩溃后最多 10 分钟恢复；不替代 parser 自身的来源性能/并发约束。
- 本地设备绑定使用可读取的 OS 标识及主机/平台/用户目录散列，原标识不输出、不传输。复制到不同绑定的机器会停止，同设备 ID 的不同 writer 会停止发布/拒绝混合。完全复制身份、OS 标识、hostname 和用户目录的镜像无法可靠区分；需用户准备独立本地身份后重新采集，禁止自动合并/重写历史。

## 验收及用户下一步

隔离三节点合成验收为 600/600/600 tokens，重复稳定，生产网页启用/暂停/恢复正常，Origin 403，隐私白名单通过。单测覆盖增量/旧记录更正、双节点并发/同机 lease、离线恢复、半写入/坏文件补扫、大小/记录数/批次数/目录项上限、重定向及身份克隆；既有日历聚合、大历史传输和 HUD hover 回归。截图仅在本机临时证据目录，没有上传。

真实三机自动同步尚未验收。用户需分别取得本地代码、构建并确认独立身份：Windows 网页显式启用，Mac 显式启用后持续 watch。产生少量实际用量后检查三机累计/今日、设备 last seen、暂停/断网恢复。代理未触碰被拒绝的桌面 Drive 路径，未远程操作另外两机、未更改 Drive 配置、未 push。
