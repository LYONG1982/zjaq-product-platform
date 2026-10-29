# 备份与隔离恢复

本轮仅开发工具并完成本地测试，没有连接真实云环境，也没有执行真实备份或恢复。

## 默认只预检

```sh
node --import tsx scripts/cloud-operations.ts plan
node --import tsx scripts/cloud-operations.ts initialize
node --import tsx scripts/cloud-operations.ts seed-originals
node --import tsx scripts/cloud-operations.ts backup
node --import tsx scripts/cloud-operations.ts restore
```

未加 `--apply` 只输出集合和前置条件，`cloudConnected:false`，不读取环境数据。初始化会在同一事务内写入 27 个 DRAFT 主档、分类、计数器和首个管理员；目标存在数据时拒绝覆盖。`seed-originals` 只补缺失的原主档，保留已有内容及更大的计数器。

## 后续获批后的操作形式（本轮未运行）

精确 `--environment` 必须等于 `CLOUDBASE_ENV_ID`。先核对环境、私有存储/IAM、首个管理员主体和备份保存位置，再按经批准的执行单操作。

```sh
node --import tsx scripts/cloud-operations.ts initialize --apply --environment ENV_ID --create-collections
node --import tsx scripts/cloud-operations.ts backup --apply --environment ENV_ID --file /PRIVATE_PATH/backup.json
node --import tsx scripts/cloud-operations.ts restore --apply --environment ISOLATED_ENV_ID --file /PRIVATE_PATH/backup.json --isolated-target
```

备份包含原始文档 ID、草稿、release、历史、幂等记录、账号、配置、未到期统计、操作日志及所有已记录的私有对象。对象在 `backup.json.assets/`，原件为资产 UUID，图片安全派生件为 `UUID.preview`，逐个流式记录 SHA-256；不将 500 MiB 对象聚合为 Buffer。备份 JSON 使用不覆盖写入和 0600 权限，资料目录 0700；整个备份含非公开内容和可能的 IP，不放入源码包或静态站点。不要复用已有备份文件/目录。

读取开始、文档结束、对象结束均比较控制 revision，期间有业务写入则报错，应在安静时段重新执行。rates 只是临时限流数据，不备份。一般集合上限 10,000，超过会失败，不静默截断；analytics 使用文档游标并排除已到期记录。统计备份也要按 90 天保留规则管理。

恢复仅允许不同且所有集合为空的隔离目标。在任何对象上传前校验集合、文档 ID、产品—草稿—release 引用、UUID 唯一性/索引、移除状态、可用管理员，以及全部原件/派生对象的文件安全和哈希；流式重传并重映射 fileId/previewFileId。统计日期恢复为 Date 并保留原到期时间，已到期记录跳过。恢复写入期间 ready=false，全部完成才 ready=true。恢复不是一个大型事务；中途失败的目标保留未就绪状态，应检查失败位置并选择新的空隔离环境，不覆盖原环境或自动清空失败目标。

尚需真实演练：SDK 缺文档响应、事务重试与故障、身份主体迁移、IAM/桶策略、完整对象哈希、恢复后的草稿/公共查询/Range、重启后幂等、失败恢复流程。通过内存仓储测试不能替代这些证据。

## 本地会话

Mock 进程不提供正式持久化恢复。历史报告里的端口与检查点只对应当时会话；本轮验收使用独立的 3303 虚构会话。检查点和种子日志仅在 work 中，不进入源码，也不称完整数据库备份。原 27 主档草稿保持，测试脚本不对真实环境执行。
