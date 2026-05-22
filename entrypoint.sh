#!/bin/sh
set -e

CRON_FILE="${CRON_FILE_PATH:-/etc/cron.d/mcko-recordings}"

if [ ! -f "$CRON_FILE" ]; then
    echo "# MCKO Recording Scheduler" > "$CRON_FILE"
    echo "# minute hour * * day_of_week  command" >> "$CRON_FILE"
    chmod 644 "$CRON_FILE"
fi

# Ensure /etc/cron.d exists
mkdir -p /etc/cron.d

# Start cron daemon
cron

exec uvicorn main:app --host 0.0.0.0 --port 8000