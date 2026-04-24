#!/usr/bin/env bash
# deploy.sh — sync MediaManagement to the Synology NAS and rebuild the container.
#
# Usage:
#   ./deploy.sh                 # rsync + docker compose down/up --build
#   ./deploy.sh --dry-run       # preview what would change, no transfer
#   ./deploy.sh --skip-restart  # rsync only, leave container alone
#   ./deploy.sh --help
#
# Environment overrides (all optional):
#   NAS_HOST     default: 192.168.50.102
#   NAS_USER     default: jphelan
#   REMOTE_PATH  default: /volume1/docker/MediaManagement
#
# Notes:
#   - Remote config/default.yaml is NEVER overwritten; production secrets
#     (Radarr/Sonarr API keys, Pushover tokens) live there.
#   - Remote data/ (SQLite DB) is runtime state, not synced.
#   - `docker restart` does NOT rebuild — this script uses
#     `docker compose down && up -d --build` so code changes take effect.

set -euo pipefail

NAS_HOST="${NAS_HOST:-192.168.50.102}"
NAS_USER="${NAS_USER:-jphelan}"
REMOTE_PATH="${REMOTE_PATH:-/volume1/docker/MediaManagement}"

DRY_RUN=""
SKIP_RESTART=""
for arg in "$@"; do
  case "$arg" in
    -n|--dry-run)     DRY_RUN="--dry-run" ;;
    --skip-restart)   SKIP_RESTART=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

cd "$(dirname "$0")"

echo "▸ Syncing → ${NAS_USER}@${NAS_HOST}:${REMOTE_PATH}/"
# Excludes:
#   .git/, node_modules/, dist/   — rebuilt inside the Docker image
#   data/                         — SQLite DB, runtime state, keep remote
#   config/default.yaml           — production secrets, never overwrite
#   .claude/, .DS_Store, ._*      — local/editor noise
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"
rsync -rltvz --delete $DRY_RUN \
  -e "ssh $SSH_OPTS" \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='data/' \
  --exclude='config/default.yaml' \
  --exclude='.claude/' \
  --exclude='.DS_Store' \
  --exclude='._*' \
  ./ "${NAS_USER}@${NAS_HOST}:${REMOTE_PATH}/"

if [ -n "$DRY_RUN" ]; then
  echo "▸ Dry run complete — no changes applied."
  exit 0
fi

if [ -n "$SKIP_RESTART" ]; then
  echo "✓ Files synced. Container NOT restarted (--skip-restart)."
  exit 0
fi

echo "▸ Rebuilding container on NAS …"
# --remove-orphans: drop any stale containers from old compose configs.
# image prune: reclaim space from the previous build's dangling layers.
# -t allocates a TTY so sudo can prompt for a password interactively.
# Synology sudo's secure_path doesn't include /usr/local/bin, so call docker
# by absolute path.
ssh -t $SSH_OPTS "${NAS_USER}@${NAS_HOST}" "
  set -e
  cd ${REMOTE_PATH}
  sudo /usr/local/bin/docker compose down --remove-orphans
  sudo /usr/local/bin/docker compose build --pull
  sudo /usr/local/bin/docker compose up -d
  sudo /usr/local/bin/docker image prune -f
  sudo /usr/local/bin/docker compose ps
"

echo "✓ Deployed. Check http://riostore.local:8765/api/health"
