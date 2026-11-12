#!/usr/bin/env bash
# 备份 MySQL 与私有上传目录到 deploy/backups/
# 用法：deploy/scripts/backup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$DEPLOY_DIR"

set -a
# shellcheck disable=SC1091
. ./.env
set +a

TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups
SQL_FILE="backups/zjaq-$TS.sql"
STORAGE_FILE="backups/storage-$TS.tar.gz"

echo "== 备份数据库到 $SQL_FILE"
docker compose exec -T mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --databases "$MYSQL_DATABASE"' \
  > "$SQL_FILE"

echo "== 备份私有上传目录到 $STORAGE_FILE"
docker run --rm \
  -v zjaq_private-storage:/data:ro \
  -v "$DEPLOY_DIR/backups":/backup \
  alpine tar czf "/backup/storage-$TS.tar.gz" -C /data .

echo "== 完成：$(du -h "$SQL_FILE" | cut -f1) + $(du -h "$STORAGE_FILE" | cut -f1)"
echo "== 请把 backups/ 复制到服务器之外的安全位置"
