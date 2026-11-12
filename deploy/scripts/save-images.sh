#!/usr/bin/env bash
# 导出离线镜像包（含应用镜像与 mysql:5.7），输出到 work/release/<IMAGE_TAG>/
# 用法：deploy/scripts/save-images.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"

[ -f "$ENV_FILE" ] || { echo "缺少 $ENV_FILE"; exit 1; }

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${IMAGE_TAG:?请在 .env 设置 IMAGE_TAG}"

command -v docker >/dev/null 2>&1 || { echo "未找到 docker"; exit 1; }

OUT_DIR="$ROOT_DIR/work/release/$IMAGE_TAG"
mkdir -p "$OUT_DIR"
ARCHIVE="$OUT_DIR/zjaq-images-$IMAGE_TAG.tar.gz"

echo "== 导出镜像到 $ARCHIVE"
docker save "zjaq/api:$IMAGE_TAG" "zjaq/portal:$IMAGE_TAG" "zjaq/web:$IMAGE_TAG" "mysql:5.7" \
  | gzip -9 > "$ARCHIVE"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$ARCHIVE" > "$ARCHIVE.sha256"
else
  shasum -a 256 "$ARCHIVE" > "$ARCHIVE.sha256"
fi

echo "== 完成"
echo "  镜像包：$ARCHIVE"
echo "  校验值：$ARCHIVE.sha256"
echo "== 目标服务器只需：deploy/ 目录 + 本镜像包"
