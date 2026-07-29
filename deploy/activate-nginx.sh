#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo."
  exit 1
fi

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_config="${project_dir}/deploy/nginx.tonalizador.https.conf"
available_config="/etc/nginx/sites-available/tonalizador"

test -f /etc/letsencrypt/live/tonalizador.xosemiguel.eu/fullchain.pem
test -f /etc/letsencrypt/live/tonalizador.xosemiguel.eu/privkey.pem
curl --fail --silent --show-error http://127.0.0.1:3010/api/trpc/ping >/dev/null

install -m 644 "${source_config}" "${available_config}"
ln -sfn "${available_config}" /etc/nginx/sites-enabled/tonalizador
nginx -t
systemctl reload nginx

echo "HTTPS activated on the VPS public address."
