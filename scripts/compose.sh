#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Arquivo .env não existe. Execute npm run setup:env primeiro." >&2
  exit 1
fi

exec docker compose --env-file "$ROOT_DIR/.env.example" --env-file "$ROOT_DIR/.env" "$@"
