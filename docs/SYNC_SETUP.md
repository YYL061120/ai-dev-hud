# Google Drive 本地用量文件夹同步

## 最新：Mac/POSIX 安全发布适配器（待真实平台验证）

本节替代下方历史版本关于“Mac 明确拒绝启用”的说明。现在 macOS/Linux 接入目录文件描述符发布；没有 helper、构建失败或文件系统不支持时仍拒绝，绝不按路径降级。Windows 456e813 的既有适配器保持原实现。

Mac 构建需要**已经安装**的 Apple C 工具链 `/usr/bin/clang` 和项目原有 Node >=20、pnpm@9.15.0；Linux 使用已安装的 `/usr/bin/cc`。没有增加第三方原生依赖，不下载/安装编译器，不更改系统策略；若缺少工具链，构建失败并交由用户另行处理。构建按本机架构生成独立 helper 到 collector 输出目录；部署时保留 `index.js` 与同目录 `hud-directory-guard`，不得仅复制 JS，也不要拿 Windows 构建产物当 Mac 安装包。

```sh
pnpm --filter @juliantanx/aiusage... install --frozen-lockfile
pnpm build:collector
pnpm --filter @juliantanx/aiusage exec tsx ../../scripts/verify-posix-folder-guard.ts
node packages/cli/dist-collector/index.js folder-sync --help
node packages/cli/dist-collector/index.js folder-sync --status
```

上述原生验证只在临时目录生成合成 metadata，必须在实际 Mac/Linux 执行。本轮 Windows 没有 C 编译器，**尚未执行该原生验证或 Mac 构建**。先完成固定提交独立复审和此合成验证，再由用户显式选择目录启用：

```sh
node packages/cli/dist-collector/index.js folder-sync --directory '<用户本机明确选择的同步目录>' --enable --once
node packages/cli/dist-collector/index.js folder-sync --watch
node packages/cli/dist-collector/index.js folder-sync --pause
```

`--watch` 复用 Codex/Claude parser，60 秒补扫与增量发布；Ctrl+C/SIGTERM 停止。不启动 Electron。后台 LaunchAgent 仍由用户按下方预览自行安装，本轮未安装持久任务。

原生实现逐级 `openat(O_DIRECTORY|O_NOFOLLOW)`，核对 Node 取得的 dev/ino；固定 dirfd 下排他创建 `.tmp`，文件 fsync 后由 macOS `renameatx_np(RENAME_EXCL)` 或 Linux `renameat2(RENAME_NOREPLACE)` 排他发布并 fsync 目录。目录 fsync 在建立 lease 时也预检，不支持会在写文件前拒绝。同名批次不覆盖，失败清理只处理仍匹配自己 inode 的临时项，异常中止残留 `.tmp` 会被扫描器忽略。参见 [Apple 官方 rename 手册源文件](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/man/man2/rename.2)。

边界：祖先路径被换成 symlink 后，发布仍绑定原来目录身份，不能写入新目标；POSIX 不锁死目录改名，因此可能发布在被改名后的原目录。若用户目录已经改名，应暂停并重新选择。具有同账号权限、能直接修改被绑定目录中临时文件或移动原目录的恶意进程不能靠此 API 完全隔离；inode 检查不是消除这种文件项竞争的证明。

**FileProvider / Google Drive 实测仍待完成**：Mac 必须支持目录 open、排他 rename 和 fsync；Windows stream mount 必须支持已有相对原生操作。隔离 NTFS/普通本地目录通过不代表 Drive 通过。不支持会报错，保留源文件；发布后最终 fsync 意外失败可能留下完整批次，重试依靠 metadata 去重，不删除最终文件。不得为通过测试改 Drive 配置或绕过权限。

持续增长索引修复：首次扫描固定 rowid 上界，分页进度不因每轮采集追加而重置；同一个 SQLite 事务维护私有身份变更日志，逐页重放追加、删除、id/device/origin 变化，再检查 revision 一致才允许导入。该日志含本机记录 ID/设备 ID，只在私人 DB 内，不导出、不放到 Drive；保留最多 100000 项，断档后必须重新分页建基线。正常每轮少量增长可以收敛；持续变更速度超过每轮处理预算或保留容量时，不承诺无条件及时收敛，也不使用不完整索引跳过去重。导入事务内再次核对 revision，准备后发生外部写入会拒绝本轮并下轮续扫。

持续增长索引修复：首次扫描固定 rowid 上界，分页进度不因每轮采集追加而重置；同一个 SQLite 事务维护私有身份变更日志，逐页重放追加、删除、id/device/origin 变化，再检查 revision 一致才允许导入。该日志含本机记录 ID/设备 ID，只在私人 DB 内，不导出、不放到 Drive；保留最多 100000 项，断档后必须重新分页建基线。正常每轮少量增长可以收敛；持续变更速度超过每轮处理预算或保留容量时，不承诺无条件及时收敛，也不使用不完整索引跳过去重。导入事务内再次核对 revision，准备后发生外部写入会拒绝本轮并下轮续扫。

## 1e158f5 审查后的限制与修复

旧版不放行真实同步。私人数据库现在按创建控制器时与启用时的 realpath 保护真实私人目录、状态目录及其祖先/子目录；数据库经 junction 打开也不能把云根选到它所在目录。Windows 发布由 PowerShell/.NET 调用系统 NtCreateFile 的 RootDirectory 相对创建，并由 NtSetInformationFile 的 RootDirectory 相对重命名，flush/失败清理也通过文件句柄执行。Node 不再对目录字符串写临时文件；辅助进程死亡后也不按路径降级写入。句柄不支持/被占用/重定向会明确拒绝；没有安装软件或修改安全配置。

**macOS/Linux 自动文件夹同步目前明确拒绝启用**：本仓库尚无经验证的安全目录句柄发布适配器。本机无界面 parse、手动 metadata JSON/JSONL 仍可用。下文 Mac 的 folder-sync --enable/--watch 命令是功能恢复后的目标流程，当前不能当作已可部署步骤。此限制不是真实 Mac 测试结论，也没有在 Mac 上执行。真实 Google Drive 的文件系统是否支持 Windows 原生句柄发布仍需用户验收，不能用隔离 NTFS 成功代替。

Mac 当前可运行的本机采集命令（真实 Mac 未测）：

```sh
pnpm --filter @juliantanx/aiusage... install --frozen-lockfile
pnpm build:collector
node packages/cli/dist-collector/index.js parse --tool codex --no-progress
node packages/cli/dist-collector/index.js parse --tool claude-code --no-progress
```

手动导出仍按 LOCAL_DEVICE_TRANSFER：仅构建 core/web/CLI、运行无浏览器的 loopback serve，再使用本机 metadata export/export-jobs；不必构建或启动 Electron。`folder-sync --status` 可看本机配置；macOS/Linux 的 `--enable` 会明确失败，不建立自动传输任务。

Mac 当前可运行的本机采集命令（真实 Mac 未测）：

```sh
pnpm --filter @juliantanx/aiusage... install --frozen-lockfile
pnpm build:collector
node packages/cli/dist-collector/index.js parse --tool codex --no-progress
node packages/cli/dist-collector/index.js parse --tool claude-code --no-progress
```

手动导出仍按 LOCAL_DEVICE_TRANSFER：仅构建 core/web/CLI、运行无浏览器的 loopback serve，再使用本机 metadata export/export-jobs；不必构建或启动 Electron。`folder-sync --status` 可看本机配置；macOS/Linux 的 `--enable` 会明确失败，不建立自动传输任务。

本机身份索引用 records 身份变更触发器的独立 revision，不被收据/checkpoint/pricing 写入失效。自动同步以1000条分页、每轮最多50页、30秒预算准备索引，异步页间可取消并续扫；准备未完成时本轮不导入/发布。旧显式手动 import 保持同步接口，首次索引建立仍可能较慢，该限制不被自动同步复用。百万合成记录的取消/控制器停止有专门测试，不能替代真实 provider parser 的可中断性。

Windows API 依据：[NtCreateFile](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntcreatefile)、[FILE_RENAME_INFORMATION](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information)。原子文件发布的安全边界来自目录/文件句柄绑定，不来自重复 realpath。

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
