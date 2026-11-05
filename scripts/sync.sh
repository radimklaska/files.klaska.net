#!/usr/bin/env bash
# Upload ./data to the R2 bucket. Re-run any time files change; only differences are sent.
# Needs in ~/.env: CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (R2 token, Object Read & Write on this bucket).
# Usage: scripts/sync.sh [--dry-run] [extra rclone flags]
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source ~/.env; set +a
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_ACL=private
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com"
# rclone sync deletes bucket objects that are not in ./data — that is intended (./data is the source of truth).
exec rclone sync data/ r2:files-klaska-net --exclude ".htaccess" --checksum --transfers 8 --progress "$@"
