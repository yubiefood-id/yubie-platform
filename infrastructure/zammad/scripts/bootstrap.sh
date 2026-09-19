#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${ZAMMAD_COMPOSE_DIR:-/opt/zammad}"

if [[ ! -d "$TARGET_DIR" ]]; then
  git clone https://github.com/zammad/zammad-docker-compose.git "$TARGET_DIR"
fi

cp "$ROOT_DIR/.env.example" "$TARGET_DIR/.env.example.yubie"
echo "Edit $TARGET_DIR/.env then run:"
echo "  docker compose -f $TARGET_DIR/docker-compose.yml -f $ROOT_DIR/docker-compose.yubie.override.yml up -d"
