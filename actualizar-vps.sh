#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="uptconnect"
REPO_DIR="/opt/uptconnect/repo"
COMPOSE_FILE="docker-compose.server.yml"

SERVICES=(
  frontend
  auth-service
  posts-service
  profile-social-service
  chat-service
  caddy
)

echo "==> Despliegue VPS UPT Connect"
echo "==> Repo: ${REPO_DIR}"
echo "==> Proyecto Docker Compose: ${PROJECT_NAME}"

cd "${REPO_DIR}"

echo "==> Rama actual"
git branch --show-current

echo "==> Estado Git"
git status --short

echo "==> Pull de origin/main"
git pull --ff-only origin main

echo "==> Build de servicios"
docker compose -p "${PROJECT_NAME}" -f "${COMPOSE_FILE}" build "${SERVICES[@]}"

echo "==> Levantando servicios"
docker compose -p "${PROJECT_NAME}" -f "${COMPOSE_FILE}" up -d "${SERVICES[@]}"

echo "==> Contenedores activos"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep "${PROJECT_NAME}" || true

echo "==> Prueba de dominio"
curl -I --max-time 20 https://uptconnect.duckdns.org/ || true

echo "==> Deploy finalizado"
