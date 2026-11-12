#!/usr/bin/env bash
# 在具备 Docker 与网络的构建机上执行：构建全部前端产物与三个镜像。
# 用法：deploy/scripts/build-images.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"

command -v docker >/dev/null 2>&1 || { echo "未找到 docker，请先在构建机安装 Docker"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "缺少 $ENV_FILE，请先执行：cp env/.env.example .env"; exit 1; }

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${PORTAL_DOMAIN:?请在 .env 设置 PORTAL_DOMAIN}"
: "${ADMIN_DOMAIN:?请在 .env 设置 ADMIN_DOMAIN}"
: "${WX_DOMAIN:?请在 .env 设置 WX_DOMAIN}"
: "${IMAGE_TAG:?请在 .env 设置 IMAGE_TAG}"

# 浏览器端（管理后台、H5）走同源 /api；小程序必须绝对 HTTPS，且需在微信后台配置合法域名
WEB_API_BASE="/api/v1"
H5_API_BASE="/api/v1"
MP_API_BASE="https://$WX_DOMAIN/api/v1"
cd "$ROOT_DIR"

echo "== 1/4 启用 pnpm 并安装依赖"
# 仓库脚本内部会再次调用 pnpm，必须先让 pnpm 进入 PATH
corepack enable
pnpm install --frozen-lockfile

echo "== 2/4 构建前端产物（admin/H5 相对 $WEB_API_BASE，小程序绝对 $MP_API_BASE）"
VITE_API_BASE_URL="$WEB_API_BASE" pnpm build:admin
VITE_API_BASE_URL="$H5_API_BASE" pnpm build:h5
VITE_API_BASE_URL="$MP_API_BASE" pnpm build:mp-weixin
PORTAL_API_BASE_URL="http://api:3100/api/v1" pnpm build:portal

echo "== 3/4 构建 API / Portal 镜像"
docker build -f deploy/docker/Dockerfile.api -t "zjaq/api:$IMAGE_TAG" .
docker build -f deploy/docker/Dockerfile.portal \
  --build-arg "PORTAL_API_BASE_URL=http://api:3100/api/v1" \
  -t "zjaq/portal:$IMAGE_TAG" .

echo "== 4/4 构建静态站点镜像"
WEB_CTX="$ROOT_DIR/work/docker/web-context"
rm -rf "$WEB_CTX"
mkdir -p "$WEB_CTX"
cp -r apps/admin/dist "$WEB_CTX/admin"
cp -r apps/mobile/dist/build/h5 "$WEB_CTX/h5"
cp -r deploy/nginx "$WEB_CTX/nginx"
docker build -f deploy/docker/Dockerfile.web -t "zjaq/web:$IMAGE_TAG" "$WEB_CTX"

echo "== 完成：zjaq/api:$IMAGE_TAG  zjaq/portal:$IMAGE_TAG  zjaq/web:$IMAGE_TAG"
echo "== web 镜像含 admin 与 h5；小程序产物在 apps/mobile/dist/build/mp-weixin，单独交微信开发者工具，不进入镜像"
