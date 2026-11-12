#!/usr/bin/env bash
# 生成自签名证书，仅用于内网验收/域名未就绪时联调；正式上线请换 Let's Encrypt 或企业证书。
# 用法：deploy/scripts/make-self-signed-cert.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$DEPLOY_DIR"

[ -f .env ] || { echo "缺少 deploy/.env"; exit 1; }

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${PORTAL_DOMAIN:?}" "${ADMIN_DOMAIN:?}" "${WX_DOMAIN:?}"

mkdir -p certs

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 365 \
  -keyout certs/privkey.pem \
  -out certs/fullchain.pem \
  -subj "/CN=$PORTAL_DOMAIN" \
  -addext "subjectAltName=DNS:$PORTAL_DOMAIN,DNS:$ADMIN_DOMAIN,DNS:$WX_DOMAIN"

echo "== 已生成：deploy/certs/fullchain.pem 与 deploy/certs/privkey.pem"
echo "== 提示：自签名证书在浏览器会提示不受信任，仅用于验收。"
