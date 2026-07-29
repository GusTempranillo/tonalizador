#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo."
  exit 1
fi

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_config="${project_dir}/deploy/nginx.tonalizador.conf"
available_config="/etc/nginx/sites-available/tonalizador"
enabled_config="/etc/nginx/sites-enabled/tonalizador"

curl --fail --silent --show-error http://127.0.0.1:3010/api/trpc/ping >/dev/null
install -m 644 "${source_config}" "${available_config}"
ln -sfn "${available_config}" "${enabled_config}"

nginx -t
systemctl reload nginx

if ! command -v certbot >/dev/null 2>&1; then
  apt-get update
  apt-get install -y certbot python3-certbot-nginx
fi

certbot --nginx --domain tonalizador.xosemiguel.eu --redirect

"${project_dir}/deploy/activate-nginx.sh"

echo "Nginx and HTTPS are ready for https://tonalizador.xosemiguel.eu/"
