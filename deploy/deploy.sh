#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${DEPLOY_ENV_FILE:-/opt/pulse-check/.env.production}"
COMPOSE_FILE="docker-compose.prod.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing production environment file: $ENV_FILE" >&2
  exit 1
fi

export DEPLOY_VERSION="${GITHUB_SHA:-$(git rev-parse --short HEAD)}"

echo "Deploying Pulse Check version $DEPLOY_VERSION"

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  build app frontend

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  up -d --remove-orphans

echo "Waiting for API readiness..."
for _ in {1..30}; do
  if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T app \
    node -e "fetch('http://127.0.0.1:8080/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "Deployment is healthy."
    exit 0
  fi
  sleep 2
done

echo "Deployment did not become healthy." >&2
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps >&2
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail=100 app >&2
exit 1
