# 本地用量传输

入口：Dashboard 的“本地用量” `/local-usage`；Codex 项目主页 `/codex`。沿用上游仪表盘样式与中英切换。

新增本地统计复用已经解析的SQLite local-origin记录，不读session文件正文。显式metadata导入保存在同一DB的独立 `hud_usage_metadata` 表，不改变parser、原records或上游同步设置。上游云同步的synced_records仍由原Dashboard呈现，不在本页混算。

导出是 `format=ai-dev-hud-usage`、`version=1`、`exportedAt`、`records` 的JSON，只有时间、tool/model/provider/platform、五类tokens、费用/来源以及散列device/record/project/session标识。源文件、cwd、主机名、原始session ID、prompt、response、源代码、文档内容、凭据均不导出。model/provider只允许有界标识形式，异常值归为unknown。项目标签只在本地由已登记路径映射，不导出。

复核后的标识规则拒绝URL、userinfo、查询串与文件路径；provider不接受冒号/@认证形式，model保留普通namespace、Ollama标签或日期revision。导入不得通过强制字符串转换绕过枚举：platform/costSource必须真正的字符串。36a95bc原规则过宽的安全结论已撤回，以此修复及合成回归为准；旧的非法导入数据若存在，导出会明确拒绝而不是输出危险字段。

散列是稳定假名，不承诺匿名；相同安装ID在导出中保持同一设备。不同设备项目默认不同标识，尚未自动归并；可在后续用户明确选择的项目别名映射中解决。

每文件最多10 MiB、50,000条，超出明确拒绝，不截断。尚未支持大历史分块传输。导入拒绝未知版本、额外字段、非法标识、负数/非有限数、错误时间；按设备+记录去重。较新updatedAt更新导入副本，较旧作为重复，同版本不同数据记录conflicts且保留旧数据。本机parser记录优先，回流导出不会双计。有效导入在写队列/事务中执行。

今日、近7/30天按本机日历边界含今天；累计受保留日志限制。会话按设备+tool+session标识区分。用量记录不代表消息/请求。费用沿用上游API等价估计与costSource，不代表订阅账单。

`UsageMetadataSyncAdapter` 仅是可替换接口契约，没有默认网络adapter。跨设备当前需要用户显式保存、搬运、选择文件导入；不会自动发送数据。后续启用GitHub/S3/云服务应先确定账号、认证、费用和传输目标。原AIUsage已有同步功能保持原设置，与本传输契约分开。
