#!/usr/bin/env bash
# Build the Docker image, run it on an ephemeral port + volume, wait for
# healthz, run the production smoke suite, tear down. Trap on EXIT ensures
# the container is removed even on failure / Ctrl-C.
set -euo pipefail

CONTAINER=${CONTAINER:-todo-app-3-smoke}
PORT=${PORT:-3098}
IMAGE=${IMAGE:-todo-app-3}
DATA_DIR=$(mktemp -d -t todo-app-3-smoke.XXXXXX)
BASE_URL="http://localhost:${PORT}"

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  rm -rf "${DATA_DIR}"
}
trap cleanup EXIT

# Strip any stale container with the same name first (idempotent local runs).
docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true

echo "==> Building ${IMAGE}…"
docker build -q -t "${IMAGE}" . >/dev/null

echo "==> Starting ${CONTAINER} on ${PORT} (data: ${DATA_DIR})…"
docker run -d \
  --name "${CONTAINER}" \
  -p "${PORT}:3000" \
  -v "${DATA_DIR}:/data" \
  -e "CORS_ORIGIN=${BASE_URL}" \
  "${IMAGE}" >/dev/null

echo "==> Waiting for healthz…"
for i in {1..60}; do
  if curl -sf "${BASE_URL}/healthz" >/dev/null 2>&1; then
    echo "    healthy after ${i}s"
    break
  fi
  if [[ $i -eq 60 ]]; then
    echo "ERROR: container did not become healthy within 60s" >&2
    docker logs "${CONTAINER}" >&2 || true
    exit 1
  fi
  sleep 1
done

echo "==> Running production smoke suite…"
DOCKER_BASE_URL="${BASE_URL}" npx playwright test --config playwright.docker.config.ts "$@"
