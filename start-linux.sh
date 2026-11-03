#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker com suporte a Docker Compose é necessário para iniciar o jogo." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js é necessário para gerar o .env inicial." >&2
    exit 1
  fi
  node scripts/setup-env.mjs
fi

docker compose up --build -d --wait postgres server game
