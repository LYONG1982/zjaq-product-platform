#!/usr/bin/env bash
# 部署后健康检查：容器状态 + 三个入口的 HTTP 响应
# 用法：deploy/scripts/healthcheck.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$DEPLOY_DIR"

set -a
# shellcheck disable=SC1091
. ./.env
set +a

echo "== 容器状态"
docker compose ps

FAILED=0
check() {
  local name="$1" domain="$2" path="$3"
  local code
  code="$(curl -k -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -H "Host: $domain" "https://127.0.0.1$path" || echo 000)"
  case "$code" in
    2*|3*) echo "OK   $name  $domain$path  -> $code" ;;
    *)     echo "FAIL $name  $domain$path  -> $code"; FAILED=1 ;;
  esac
}

check "门户"     "$PORTAL_DOMAIN" "/"
check "后台"     "$ADMIN_DOMAIN"  "/"
check "小程序"   "$WX_DOMAIN"     "/api/v1/catalog/products"

echo
if [ "$FAILED" -ne 0 ]; then
  echo "存在异常入口，请查看：docker compose logs --tail=200"
  exit 1
fi
echo "全部入口响应正常（3xx 表示登录跳转，属预期）。"
