# 本地业务数据同步到服务器 MySQL 计划

日期：2026-11-11。状态：**仓库侧产物实施中；不连接服务器、不改服务器、不提交 git。**

## 一、目标与边界

用户要求：把本地开发库里的业务数据（1 条产品及其全部关联数据）同步到服务器已部署的 `zjaq-mysql-1`（mysql:5.7，库名/账号见 `deploy/env/.env`），并把管理员账号密码一并同步。

边界：

- 本机无服务器 SSH 权限，**不连接服务器、不直连服务器数据库**。
- 只产出可在服务器上直接执行的 SQL、文件包、备份/导入/验证命令与 SHA256。
- 密码只以现有 `scrypt` 哈希形式搬运，**SQL 中不出现明文**。
- 不改业务代码、不改 compose、不提交 git。

## 二、本地数据位置（已核实）

本地不是 mock、不是 SQLite：API 以 `DATA_PROVIDER=mysql` 运行在本机 MySQL 5.7（`127.0.0.1:3306`，库 `zjaq`），业务数据全部落在文档表 `documents(collection, doc_id, payload, expires_at)`，账号落在 `auth_users`，文件字节落在 `work/storage/objects/<2位>/<2位>/<fileId>`。

本地实际库存：

| collection | 条数 | 说明 |
| --- | --- | --- |
| products | 1 | `ZJ-Y-H-A-001`，PUBLISHED，activeReleaseId=`2f15da31-…`，publicationVersion=3 |
| drafts | 1 | `ZJ-Y-H-A-001` |
| releases | 3 | 序列 1/2/3 的不可变快照 |
| history | 1 | `ZJ-Y-H-A-001` 资料版本历史 |
| categories | 4 | miding / miyi / mishu / ai（产品依赖 miyi） |
| assets | 12 | 含 READY 10 条、REJECTED 2 条（HEVC 转码被拒，无文件） |
| uploads | 12 | uploadId → assetId 索引 |
| users / subjects | 3 / 3 | admin、biz、sales1 |
| auth_users | 3 | 同用户名，`scrypt$16384,8,1$…` 126 字符 |
| control | 16 | catalog、code-* 计数器、counter、model-/public- 索引、site-contact、analytics、state、admins、upload-* 日配额 |
| analytics | 6 | 产品资料浏览事件（带 expires_at） |
| feedback | 1 | 站点反馈 |
| audit / idempotency / rates | 87 / 90 / 1117 | 运行时/日志类，不同步 |
| auth_sessions | 3 | 登录会话，不同步 |

存储对象：由 assets 的 `fileId` / `previewFileId` 去重后共 **12 个文件、148,993,730 字节**（含 126.9 MB 视频），全部存在。

## 三、依赖闭环与本次导入范围

导入（documents）：

1. `categories` 4 条 + `control/catalog`（分类目录与引用计数，miyi=1）。
2. `products` / `drafts` / `releases`(3) / `history`（产品主档到发布快照的完整链）。
3. `assets` 12 条 + `uploads` 12 条（资料元数据与 uploadId 索引）。
4. `control`：`code-*` 计数器、`counter`、`model-<hash>`、`public-<uuid>`、`site-contact`、`analytics` 设置。
5. `users` 3 + `subjects` 3 + `auth_users` 3（账号与密码哈希）。
6. `analytics` 6、`feedback` 1。

存储对象：12 个文件按原目录结构打包，导入到 `zjaq_private-storage` 卷（API 容器 `/app/work/storage`）。

不同步（运行时/派生数据，避免污染服务器）：

- `control/state`：初始化状态与 revision 版本号，服务器已有；覆盖会干扰维护开关。
- `control/admins`：由账号派生。
- `control/upload-YYYY-MM-DD`：按天上传配额计数，属本地当日状态。
- `audit`：本地审计流水，含本地 IP 与本地 userId，需要额外 ID 重映射。
- `idempotency`、`rates`：请求去重与限流桶，纯运行时、带 TTL。
- `auth_sessions`：登录会话，导入后让用户重新登录更安全。

## 四、账号与 ID 映射策略

服务器通常已由 `pnpm db:init` 建过 `admin`，其 `auth_users.user_id` 是服务器随机 UUID，与本地不同；直接按主键插入会撞 `uq_username`。

SQL 采用「按用户名对齐」：

1. `auth_users`：用户名不存在则用本地 userId 插入；已存在则**只更新 `password_hash`**（保留服务器 userId 与 created_at）。
2. 建临时表 `sync_user_map(local_id, server_id)`，按用户名回填映射。
3. `users` 文档：`doc_id = server_id`，payload 用 `JSON_SET` 把 `userId`、`subjectId` 改为服务器 ID。
4. `subjects` 文档：`doc_id = SHA2(CONCAT('mysql:', server_id), 256)`，`userId` 同步改写。

效果：本地三个账号的**原密码在服务器可用**；服务器原有 admin 的 userId 不变，不会产生重复用户名。

## 五、幂等与冲突策略

- `documents` 全部 `INSERT … ON DUPLICATE KEY UPDATE payload=VALUES(payload), expires_at=VALUES(expires_at), updated_at=VALUES(updated_at)`。
- `control/code-*` 与 `counter` 的 `next` 取 `GREATEST(服务器现值, 本地值)`，避免服务器后续分配编号重复或回退。
- 存储对象解包覆盖同名文件，不删除服务器已有对象。
- 全流程执行前必须 `mysqldump` 备份数据库、`tar` 备份私有存储卷。

## 六、产物

目录：`2026-11-11/data-sync/outputs/`

| 文件 | 用途 |
| --- | --- |
| `import.sql` | 幂等导入 SQL（UTF-8，含 `SET NAMES utf8mb4`） |
| `verify.sql` | 导入后落库校验查询 |
| `storage-objects.tar.gz` | 12 个私有存储对象（保留 `objects/xx/yy/<fileId>` 结构） |
| `storage-objects.sha256` | 对象清单校验文件（容器内 `sha256sum -c` 用） |
| `SHA256SUMS.txt` | 三个交付文件的 SHA256 |
| `README.md` | 备份、传输、导入、校验、回滚的逐步命令 |

## 七、服务器侧执行步骤（概要）

1. 备份：`mysqldump` 到带时间戳文件；`tar` 备份 `/app/work/storage`。
2. 传输：`scp` 三个文件到服务器部署目录。
3. 数据库导入：`docker cp import.sql zjaq-mysql-1:/tmp/`，`docker exec -i zjaq-mysql-1 mysql --default-character-set=utf8mb4 -uzj_app -p"$MYSQL_PASSWORD" zjaq < import.sql`。
4. 存储导入：`docker cp` 到 `zjaq-api-1:/tmp/`，在容器内解包到 `/app/work/storage`，再用 `sha256sum -c` 校验。
5. 验证：执行 `verify.sql`，并用本地账号登录后台、打开产品资料预览。
6. 回滚：还原 mysqldump；存储按备份包还原。

## 八、风险与限制

- 覆盖式同步：若服务器已有同 `doc_id` 的产品/资料，会被本地版本覆盖（这是本次预期）。
- `control/catalog` 的引用计数以本地为准（miyi=1）；若服务器另有产品，计数会暂时偏低。
- 账号密码同步会**改写服务器同名账号的密码**为本地密码。
- 未在服务器上实测；所有结果以执行后 `verify.sql` 输出为准。

## 九、实施记录

已完成（2026-11-11，全部在本机，未连接服务器）：

1. 数据摸底：本机 MySQL 5.7（`127.0.0.1:3306`，库 `zjaq`）文档表库存与 `work/storage/objects` 已核对；1 个产品 `ZJ-Y-H-A-001`、3 个发布快照、12 条资料记录、12 个存储对象（148,993,730 B）。
2. 生成 `import.sql`：用一次性脚本按集合导出并用 `connection.escape` 转义；账号按用户名对齐，`users`/`subjects` 用 `sync_user_map` + `JSON_SET` + `SHA2` 改写 ID；计数器用 `GREATEST` 合并。
3. 本地验证（临时库 `zjaq_sync_test`）：
   - 先注入“服务器已有 admin（user_id=`1111…`，旧哈希）+ `control/state.revision=500` + `code-ZJ-Y-H-A.next=9`”的冲突场景，再执行 `import.sql`。
   - 结果：`auth_users` 仅 3 行，admin 的 `user_id` 保持 `1111…` 且 `password_hash` 等于本地；`users` 3 行且 admin 文档落在服务器 ID 下；`subjects` 3 行；`code-ZJ-Y-H-A` 合并为 `next=9`；`control/state` 保持 `revision=500`。
   - 连续执行两次，条数与计数器不变，证明幂等。
   - 对 `products/drafts/releases/history/categories/assets/uploads/analytics/feedback` 全部记录逐条比对 `SHA2(payload)`，与源库完全一致。
4. 打包：12 个对象按 `objects/xx/yy/<fileId>` 结构打入 `storage-objects.tar.gz`（141,888,983 B），并生成 `storage-objects.sha256`（12 行，与 assets 文档内记录的 checksum 一致）。
5. 交付物 SHA256（`SHA256SUMS.txt`）：`import.sql` b1d899a1…、`verify.sql` 8d877446…、`storage-objects.tar.gz` dcdeead7…、`storage-objects.sha256` 262dc255…。

限制：目标服务器状态未知；导入为覆盖式（同 `doc_id` 以本地为准）、账号密码会改写同名账号；服务器侧结果以 `verify.sql` 输出为准。

产物：`2026-11-11/data-sync/outputs/`（`README.md`、`import.sql`、`verify.sql`、`storage-objects.tar.gz`、`storage-objects.sha256`、`SHA256SUMS.txt`）。
