#!/usr/bin/env bash
# 启动/更新生产服务
# 用法：
#   deploy/scripts/deploy.sh                       # 常规启动/更新
#   deploy/scripts/deploy.sh --init <账号> <密码>   # 首次部署：先初始化数据库与管理员
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$DEPLOY_DIR"

[ -f .env ] || { echo "缺少 deploy/.env，请先执行：cp env/.env.example .env 并填写"; exit 1; }
[ -d certs ] || echo "提示：deploy/certs 不存在，nginx 将无法加载证书；可用 make-self-signed-cert.sh 生成测试证书"

set -a
# shellcheck disable=SC1091
. ./.env
set +a

health_of() {
  local id
  id="$(docker compose ps -q "$1" 2>/dev/null || true)"
  [ -n "$id" ] || { echo ""; return; }
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo ""
}

wait_mysql() {
  echo "== 等待 MySQL 就绪"
  for _ in $(seq 1 40); do
    [ "$(health_of mysql)" = "healthy" ] && return 0
    sleep 3
  done
  echo "MySQL 未在 120 秒内就绪，请查看：docker compose logs mysql"
  exit 1
}

if [ "${1:-}" = "--init" ]; then
  INIT_USER="${2:-}"
  INIT_PASS="${3:-}"
  [ -n "$INIT_USER" ] && [ -n "$INIT_PASS" ] || { echo "用法：deploy.sh --init <账号> <密码>"; exit 1; }
  [ "${#INIT_PASS}" -ge 8 ] || { echo "密码至少 8 位"; exit 1; }
  docker compose up -d mysql
  wait_mysql
  echo "== 初始化数据库与管理员（账号：$INIT_USER）"
  docker compose run --rm \
    -e ADMIN_USERNAME="$INIT_USER" \
    -e ADMIN_PASSWORD="$INIT_PASS" \
    api pnpm db:init
fi

docker compose up -d --remove-orphans
docker compose ps

echo
echo "== 等待健康检查（最多 240 秒）"
for i in $(seq 1 80); do
  pending=""
  for svc in mysql api portal; do
    state="$(health_of "$svc")"
    [ "$state" = "healthy" ] || pending="$pending $svc(${state:-未启动})"
  done
  if [ -z "$pending" ]; then
    echo "mysql / api / portal 均已 healthy。"
    break
  fi
  if [ "$i" -eq 80 ]; then
    echo "以下服务未在 240 秒内变为 healthy：$pending"
    echo "首次部署请先执行：deploy/scripts/deploy.sh --init <账号> <密码>"
    echo "查看日志：docker compose logs --tail=200"
    exit 1
  fi
  sleep 3
done

echo
echo "门户      https://$PORTAL_DOMAIN/"
echo "后台      https://$ADMIN_DOMAIN/"
echo "小程序接口 https://$WX_DOMAIN/api/v1"
