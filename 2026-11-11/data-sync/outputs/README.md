# 本地数据 → 服务器 MySQL 同步包

生成时间：2026-11-11。源：本机 MySQL 5.7 库 `zjaq`（本地开发库）。目标：服务器容器 `zjaq-mysql-1`（mysql:5.7）与 `zjaq-api-1` 的私有存储卷。

本包只包含**一个产品及其完整依赖闭包**与**三个后台账号**，不含运行时数据。

## 文件清单

| 文件 | 大小 | 用途 |
| --- | --- | --- |
| `import.sql` | 143,513 B | 幂等导入 SQL |
| `verify.sql` | 3,751 B | 导入后只读校验 |
| `storage-objects.tar.gz` | 141,888,983 B | 12 个私有文件（资料原件/预览，含 126.9 MB 视频） |
| `storage-objects.sha256` | 1,416 B | 容器内 `sha256sum -c` 校验清单 |
| `SHA256SUMS.txt` | 336 B | 上述文件的 SHA256 |

```
b1d899a1eaefba0ee5a6db2e5b93ec3ccd4d252b899fb331af58b5ef07414724  import.sql
8d87744694df972479a54faaacc75b5804754053c6a9f70eb1f19131f461050a  verify.sql
dcdeead7fd7c94afe5e9127e25bf877eb4dc2ab5158037f6c6689d53e52adb1c  storage-objects.tar.gz
262dc2554c8fa1db7aecaac679fc9561c5b010fd1094d5cdb75656a150c1dcd7  storage-objects.sha256
```

## 一、导入范围

写入 `documents`：

- `products` 1、`drafts` 1、`releases` 3（序列 1/2/3）、`history` 1
- `categories` 4（miding / miyi / mishu / ai）
- `assets` 12、`uploads` 12
- `control`：`catalog`、`analytics`、`site-contact`、`model-<hash>`、`public-<uuid>`、`code-*` 计数器、`counter`
- `analytics` 6、`feedback` 1

写入 `auth_users` / `users` / `subjects`：`admin`、`biz`、`sales1` 三个账号。

**不同步**：`control/state`（初始化状态与 revision）、`control/admins`（派生值）、`control/upload-YYYY-MM-DD`（当日配额）、`audit`、`idempotency`、`rates`、`auth_sessions`。

## 二、执行前的准备

在服务器上，进入部署目录（以下示例为 `/opt/zjaq/deploy`，按实际替换），并把本包四个文件上传到 `~/zjaq-data-sync`。

```bash
cd /opt/zjaq/deploy
set -a; . ./.env; set +a        # 读出 MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD / MYSQL_DATABASE
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p backups
```

校验上传完整性（在存放本包的目录执行）：

```bash
cd ~/zjaq-data-sync
sha256sum -c SHA256SUMS.txt
```

## 三、第 1 步：备份（必须执行）

```bash
# 数据库逻辑备份
docker exec zjaq-mysql-1 sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --default-character-set=utf8mb4 "$MYSQL_DATABASE"' \
  > /opt/zjaq/deploy/backups/mysql-$TS.sql

# 私有存储备份
docker exec zjaq-api-1 tar czf - -C /app/work/storage . \
  > /opt/zjaq/deploy/backups/private-storage-$TS.tar.gz

ls -lh /opt/zjaq/deploy/backups/
head -c 200 /opt/zjaq/deploy/backups/mysql-$TS.sql
```

确认 SQL 备份末尾有 `-- Dump completed` 再继续。

## 四、第 2 步：导入数据库

```bash
docker cp import.sql zjaq-mysql-1:/tmp/zjaq-import.sql
docker exec -i zjaq-mysql-1 mysql --default-character-set=utf8mb4 \
  -uzj_app -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" < import.sql
```

SQL 末尾会打印各集合条数与账号数，预期：

```
analytics 6 / assets 12 / categories 4 / drafts 1 / feedback 1 / history 1
products 1 / releases 3 / subjects 3 / uploads 12 / users 3 / accounts 3
```

说明：

- 脚本先建临时表 `sync_user_map`，按**用户名**对齐账号；服务器已有同名账号时只更新 `password_hash`，保留服务器 `user_id`，不会产生重复用户名。
- 所有文档写入都是 `ON DUPLICATE KEY UPDATE`，可重复执行。
- `code-*` 与 `counter` 的 `next` 取服务器与本地较大值。
- 可重复执行，第二次结果与第一次一致。

## 五、第 3 步：导入私有存储文件

```bash
docker cp storage-objects.tar.gz zjaq-api-1:/tmp/storage-objects.tar.gz
docker cp storage-objects.sha256 zjaq-api-1:/tmp/storage-objects.sha256
docker exec zjaq-api-1 sh -c 'tar xzf /tmp/storage-objects.tar.gz -C /app/work/storage && cd /app/work/storage && sha256sum -c /tmp/storage-objects.sha256 && rm -f /tmp/storage-objects.tar.gz /tmp/storage-objects.sha256'
```

预期 12 行 `objects/xx/yy/<fileId>: OK`。解包只新增/覆盖文件，不删除服务器已有对象。

## 六、第 4 步：验证落库

```bash
docker exec -i zjaq-mysql-1 mysql --default-character-set=utf8mb4 \
  -uzj_app -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" < verify.sql
```

判读标准：

| 检查 | 期望 |
| --- | --- |
| `1_counts` | products=1、drafts=1、releases=3、history=1、categories=4、assets=12、uploads=12、users=3、subjects=3、analytics=6、feedback=1 |
| `2_product` | publication_state=PUBLISHED、publication_version=3 |
| `3_product_links` | release_exists=1、category_exists=1、category_id=miyi |
| `4_releases` | sequence 为 1/2/3 |
| `5_assets` | READY=10、REJECTED=2 |
| `6_accounts` | 三行 user_doc_exists=1、subject_index_exists=1 |
| `7_counters` | code-ZJ-Y-H-A 的 next ≥ 2 |
| `8_product_indexes` | model-* 与 public-* 均指向 ZJ-Y-H-A-001 |

页面验证：

1. 打开 `https://admin.product.zhongjianquan.com`，用**本地后台的 admin 账号密码**登录（密码哈希已同步）。
2. 产品列表应出现「移动设备摄像头管控系统」，状态已发布。
3. 打开产品资料预览：6 份资料应能加载 PDF/图片，视频可播放（视频 126.9 MB）。
4. 公开门户 `https://portal.product.zhongjianquan.com` 产品一览可见该产品。

若页面仍显示旧状态，执行 `docker compose restart api` 后再刷新（导入本身不要求重启）。

## 七、回滚

```bash
# 数据库
docker exec -i zjaq-mysql-1 mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 "$MYSQL_DATABASE" \
  < /opt/zjaq/deploy/backups/mysql-$TS.sql

# 存储（覆盖回备份版本）
docker exec -i zjaq-api-1 tar xzf - -C /app/work/storage \
  < /opt/zjaq/deploy/backups/private-storage-$TS.tar.gz
```

## 八、注意事项

- 账号密码同步会**改写服务器同名账号 password_hash**；不想覆盖时，可注释 `import.sql` 中三行 `UPDATE auth_users SET password_hash = ...` 后重跑。
- 若服务器已有同 `doc_id` 的产品/资料，会被本地版本覆盖（本次同步的预期行为）。
- `control/catalog` 的引用计数以本地为准（miyi=1）；服务器若已有其他产品，分类计数会暂时偏低，后续在后台保存产品时自愈。
- 本地导入验证在临时库 `zjaq_sync_test` 完成：含“服务器已存在同名 admin（不同 user_id）”与“计数器已到 9”的冲突场景，重复执行两次结果一致；产品/快照/资料/统计 payload 与源库 SHA256 完全一致。未在目标服务器实测，最终以第 4 步输出为准。
