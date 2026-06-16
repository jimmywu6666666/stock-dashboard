#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${ROOT_DIR}/.env.deploy"

if [[ -f "${CONFIG_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${CONFIG_FILE}"
  set +a
fi

: "${DEPLOY_HOST:?请在 .env.deploy 中设置 DEPLOY_HOST}"
: "${DEPLOY_USER:?请在 .env.deploy 中设置 DEPLOY_USER}"
: "${DEPLOY_PATH:?请在 .env.deploy 中设置 DEPLOY_PATH}"

DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_COMPOSE_CMD="${DEPLOY_COMPOSE_CMD:-docker compose}"
DEPLOY_HEALTH_PATH="${DEPLOY_HEALTH_PATH:-/api/app-version}"
DEPLOY_BACKUP_KEEP="${DEPLOY_BACKUP_KEEP:-10}"
SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"
SSH_ARGS=(-p "${DEPLOY_PORT}")
RSYNC_SSH="ssh -p ${DEPLOY_PORT}"

if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
  SSH_ARGS+=(-i "${DEPLOY_SSH_KEY}")
  RSYNC_SSH="ssh -p ${DEPLOY_PORT} -i ${DEPLOY_SSH_KEY}"
fi

echo "Deploying to ${SSH_TARGET}:${DEPLOY_PATH}"

DEPLOY_ID="$(date +%Y%m%d%H%M%S)"

remote_cmd() {
  ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" "$@"
}

remote_cmd "mkdir -p '${DEPLOY_PATH}'"

echo "Creating remote backup ${DEPLOY_ID}..."
remote_cmd "
  set -e
  mkdir -p '${DEPLOY_PATH}' '${DEPLOY_PATH}/backups'
  cd '${DEPLOY_PATH}'
  if [ -f .env ]; then
    cp .env 'backups/env-${DEPLOY_ID}'
  fi
  if [ -f data/dashboard.sqlite ]; then
    mkdir -p 'backups/data-${DEPLOY_ID}'
    cp data/dashboard.sqlite 'backups/data-${DEPLOY_ID}/dashboard.sqlite'
  fi
  if [ -f docker-compose.yml ]; then
    tar \
      --exclude='./data' \
      --exclude='./backups' \
      --exclude='./.git' \
      -czf 'backups/code-${DEPLOY_ID}.tgz' .
  fi
"

if command -v rsync >/dev/null 2>&1 && ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" "command -v rsync >/dev/null 2>&1"; then
  rsync -az --delete \
    -e "${RSYNC_SSH}" \
    --exclude ".git/" \
    --exclude ".env" \
    --exclude ".env.deploy" \
    --exclude "/data/" \
    --exclude "/backups/" \
    --exclude "/node_modules/" \
    --exclude "daily_stock_analysis/.env" \
    --exclude "daily_stock_analysis/.venv/" \
    --exclude "/daily_stock_analysis/data/" \
    --exclude "/daily_stock_analysis/logs/" \
    --exclude "/daily_stock_analysis/reports/" \
    --exclude "/daily_stock_analysis/longbridge_tokens/" \
    --exclude ".DS_Store" \
    "${ROOT_DIR}/" "${SSH_TARGET}:${DEPLOY_PATH}/"
else
  echo "rsync unavailable locally or remotely; using tar over ssh."
  COPYFILE_DISABLE=1 tar \
    --format ustar \
    --exclude ".git" \
    --exclude ".env" \
    --exclude ".env.deploy" \
    --exclude "./data" \
    --exclude "./backups" \
    --exclude "./node_modules" \
    --exclude "daily_stock_analysis/.env" \
    --exclude "daily_stock_analysis/.venv" \
    --exclude "./daily_stock_analysis/data" \
    --exclude "./daily_stock_analysis/logs" \
    --exclude "./daily_stock_analysis/reports" \
    --exclude "./daily_stock_analysis/longbridge_tokens" \
    --exclude ".DS_Store" \
    -czf - -C "${ROOT_DIR}" . \
    | ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" "tar --no-same-owner -xzf - -C '${DEPLOY_PATH}'"
fi

remote_cmd "
  set -e
  cd '${DEPLOY_PATH}'
  if [ ! -f .env ]; then
    cp .env.example .env
    echo '已创建 ${DEPLOY_PATH}/.env，请先在服务器上修改密码、SESSION_SECRET 和 OCR 配置后再重新部署。'
    exit 2
  fi
  ${DEPLOY_COMPOSE_CMD} build
  ${DEPLOY_COMPOSE_CMD} up -d

  APP_PORT=\$(awk -F= '/^APP_PORT=/{print \$2}' .env | tail -n 1)
  APP_PORT=\${APP_PORT:-3000}
  HEALTH_URL=\"http://127.0.0.1:\${APP_PORT}${DEPLOY_HEALTH_PATH}\"
  echo \"Checking \${HEALTH_URL}...\"
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS \"\${HEALTH_URL}\" >/dev/null; then
      ${DEPLOY_COMPOSE_CMD} ps
      find backups -maxdepth 1 -type f -name 'code-*.tgz' | sort -r | tail -n +$((DEPLOY_BACKUP_KEEP + 1)) | xargs -r rm -f
      find backups -maxdepth 1 -type f -name 'env-*' | sort -r | tail -n +$((DEPLOY_BACKUP_KEEP + 1)) | xargs -r rm -f
      find backups -maxdepth 1 -type d -name 'data-*' | sort -r | tail -n +$((DEPLOY_BACKUP_KEEP + 1)) | xargs -r rm -rf
      exit 0
    fi
    sleep 2
  done

  echo 'Health check failed; rolling back code and env from backup ${DEPLOY_ID}.' >&2
  if [ -f 'backups/code-${DEPLOY_ID}.tgz' ]; then
    tar --no-same-owner -xzf 'backups/code-${DEPLOY_ID}.tgz' -C '${DEPLOY_PATH}'
  fi
  if [ -f 'backups/env-${DEPLOY_ID}' ]; then
    cp 'backups/env-${DEPLOY_ID}' .env
  fi
  ${DEPLOY_COMPOSE_CMD} up -d --build
  exit 1
"

echo "Deploy finished."
