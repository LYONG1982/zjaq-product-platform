#!/usr/bin/env bash
# 恢复备份（会覆盖现有数据库与私有上传目录）
# 用法：deploy/scripts/restore.sh <备份.sql> <storage-备份.tar.gz>
set -euo pipefail

SQL_FILE="${1:-}"
STORAGE_FILE="${2:-}"
[ -f "$SQL_FILE" ] || { echo "用法：restore.sh <备份.sql> <storage-备份.tar.gz>"; exit 1; }
[ -f "$STORAGE_FILE" ] || { echo "storage 备份不存在：$STORAGE_FILE"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$DEPLOY_DIR"

set -a
# shellcheck disable=SC1091
. ./.env
set +a

echo "警告：该操作会用备份覆盖当前数据。10 秒内按 Ctrl+C 取消。"
sleep 10

echo "== 停止 api / portal"
docker compose stop api portal

echo "== 恢复数据库"
docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD"' < "$SQL_FILE"

echo "== 恢复私有上传目录"
STORAGE_ABS="$(cd "$(dirname "$STORAGE_FILE")" && pwd)/$(basename "$STORAGE_FILE")"
docker run --rm \
  -v zjaq_private-storage:/data \
  -v "$(dirname "$STORAGE_ABS")":/backup:ro \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/$(basename "$STORAGE_ABS") -C /data"

echo "== 启动 api / portal"
docker compose up -d api portal

echo "== 完成。请登录后台抽查产品、资料与上传文件。"
