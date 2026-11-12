# 备份与隔离恢复

工具以自建 MySQL 为目标：`scripts/cloud-operations.ts` 通过 `MYSQL_*` 连接，备份格式与存储实现无关。脚本本身未连接任何外部服务，只有在显式 `--apply` 且环境匹配时才读写数据库。

## 默认只预检

```sh
node --import tsx scripts/cloud-operations.ts plan
node --import tsx scripts/cloud-operations.ts initialize --apply --environment zjaq
node --import tsx scripts/cloud-operations.ts backup --apply --environment zjaq --file /PRIVATE_PATH/backup.json
node --import tsx scripts/cloud-operations.ts restore --apply --environment ISOLATED_DB --file /PRIVATE_PATH/backup.json --isolated-target
```

未加 `--apply` 只输出集合和前置条件，不读取数据库。初始化会先执行数据库迁移，再写入分类、控制记录和首个管理员（`ADMIN_USERNAME` / `ADMIN_PASSWORD`）；不导入示例产品，目标存在数据时拒绝覆盖。

## 后续获批后的操作形式

精确 `--environment` 必须等于 `MYSQL_DATABASE`，执行前确认数据库、专用账号、`ZJ_STORAGE_DIR` 与备份保存位置。

`initialize` 示例：

```sh
DATA_PROVIDER=mysql MYSQL_USER=zj_app MYSQL_PASSWORD=... MYSQL_DATABASE=zjaq \
ADMIN_USERNAME=admin ADMIN_PASSWORD=... \
node --import tsx scripts/cloud-operations.ts initialize --apply --environment zjaq
```

备份包含原始文档 ID、草稿、release、历史、幂等记录、账号、配置、未到期统计、操作日志及所有已记录的私有对象。对象在 `backup.json.assets/`，原件为资产 UUID，图片安全派生件为 `UUID.preview`，逐个流式记录 SHA-256；不将 500 MiB 对象聚合为 Buffer。备份 JSON 使用不覆盖写入和 0600 权限，资料目录 0700；整个备份含非公开内容和可能的 IP，不放入源码包或静态站点。不要复用已有备份文件/目录。

读取开始、文档结束、对象结束均比较控制 revision，期间有业务写入则报错，应在安静时段重新执行。rates 只是临时限流数据，不备份。一般集合上限 10,000，超过会失败，不静默截断；analytics 使用文档游标并排除已到期记录。统计备份也要按 90 天保留规则管理。

恢复仅允许不同且所有集合为空的隔离目标。在任何对象上传前校验集合、文档 ID、产品—草稿—release 引用、UUID 唯一性/索引、移除状态、可用管理员，以及全部原件/派生对象的文件安全和哈希；流式重传并重映射 fileId/previewFileId。统计日期恢复为 Date 并保留原到期时间，已到期记录跳过。恢复写入期间 ready=false，全部完成才 ready=true。恢复不是一个大型事务；中途失败的目标保留未就绪状态，应检查失败位置并选择新的空隔离目标，不覆盖原环境或自动清空失败目标。

尚需真实演练：MySQL 连接中断与事务重试、账号迁移、恢复后的草稿/公共查询/Range、重启后幂等、失败恢复流程。通过内存仓储测试不能替代这些证据。

## 本地数据库

本地测试使用独立数据库或独立测试库，不复用有用户修改的库。历史报告里的端口与检查点只对应当时会话；检查点和种子日志仅在 work 中，不进入源码，也不称完整数据库备份。
