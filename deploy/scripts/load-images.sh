#!/usr/bin/env bash
# 在目标服务器导入离线镜像包
# 用法：deploy/scripts/load-images.sh /path/to/zjaq-images-<tag>.tar.gz
set -euo pipefail

ARCHIVE="${1:-}"
[ -n "$ARCHIVE" ] || { echo "用法：load-images.sh <镜像包路径>"; exit 1; }
[ -f "$ARCHIVE" ] || { echo "镜像包不存在：$ARCHIVE"; exit 1; }

command -v docker >/dev/null 2>&1 || { echo "未找到 docker，请先安装 Docker"; exit 1; }

echo "== 校验 SHA256（存在同名 .sha256 时）"
if [ -f "$ARCHIVE.sha256" ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "$ARCHIVE.sha256"
  else
    shasum -a 256 -c "$ARCHIVE.sha256"
  fi
fi

echo "== 导入镜像"
docker load -i "$ARCHIVE"

echo "== 完成，当前镜像："
docker images | grep -E 'zjaq/|mysql' || true
