#!/usr/bin/env bash
# 首次部署初始化数据库：建表（API 启动也会自动迁移）、写入分类/控制记录与首个管理员。
# 用法：deploy/scripts/init-admin.sh <登录账号> <密码>
set -euo pipefail

USERNAME="${1:-}"
PASSWORD="${2:-}"
[ -n "$USERNAME" ] && [ -n "$PASSWORD" ] || { echo "用法：init-admin.sh <登录账号> <密码>"; exit 1; }
[ "${#PASSWORD}" -ge 8 ] || { echo "密码至少 8 位"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$DEPLOY_DIR"

[ -f .env ] || { echo "缺少 deploy/.env"; exit 1; }

echo "== 执行 db:init（账号：$USERNAME）"
docker compose run --rm \
  -e ADMIN_USERNAME="$USERNAME" \
  -e ADMIN_PASSWORD="$PASSWORD" \
  api pnpm db:init

echo "== 完成，请使用该账号登录 https://<ADMIN_DOMAIN>/"
echo "== 提示：该脚本仅用于首次初始化；后续账号请在后台「系统设置 → 后台账号」维护"
