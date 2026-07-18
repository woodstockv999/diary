#!/usr/bin/env bash
# cronから週次で起動し、過去7日分のdiaryエントリの要約をDiscordに投稿する。
set -euo pipefail

APP_DIR="/home/w00dst0ck/apps/diary"
LOG="$HOME/logs/diary-weekly-summary.log"

echo "=== $(date -Iseconds) diary weekly-summary start ===" >> "$LOG"
cd "$APP_DIR"
node weekly-summary.js >> "$LOG" 2>&1
echo "=== $(date -Iseconds) diary weekly-summary end ===" >> "$LOG"
