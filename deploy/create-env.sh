#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${project_dir}/.env"

if [[ -e "${env_file}" ]]; then
  echo ".env already exists; no changes made."
  exit 1
fi

db_password="$(openssl rand -hex 24)"
db_root_password="$(openssl rand -hex 32)"

umask 077
install -m 600 /dev/null "${env_file}"
{
  printf 'DB_PASSWORD=%s\n' "${db_password}"
  printf 'DB_ROOT_PASSWORD=%s\n' "${db_root_password}"
  printf 'DATABASE_URL=mysql://tonalizador:%s@database:3306/tonalizador\n' "${db_password}"
  printf 'SPOTIFY_CLIENT_ID=\n'
  printf 'SPOTIFY_CLIENT_SECRET=\n'
  printf 'SPOTIFY_MARKET=ES\n'
} >> "${env_file}"

echo "Created ${env_file} with private MariaDB credentials."
echo "Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET before starting the app."
