#!/bin/bash
# Start Next.js seravavatar-hub frontend as www-data, fully detached.
# Usage: sudo /var/www/seravavatar-hub/start-next.sh
set -e

PROJECT_DIR="/var/www/seravavatar-hub/public_html"
LOG="/var/log/seravavatar-frontend.log"
PORT=3006
PATTERN="next start -p $PORT"   # narrow: only our own project

# Kill any existing seravavatar-hub next-server processes
for pid in $(pgrep -f "$PATTERN" 2>/dev/null); do
    kill -9 "$pid" 2>/dev/null || true
done
sleep 3

# Verify port is free
if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
    echo "ERROR: Port $PORT still in use" >&2
    exit 1
fi

: > "$LOG" 2>/dev/null || true

# Pick a Node binary that actually exists. Older nvm installs
# (/home/openclaw/.nvm/versions/node/v24.14.1/bin/node etc.) were
# cleaned up at some point — fall back to whatever's on the global
# PATH first, then to a known-good nvm install.
NODE_BIN="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
    NODE_BIN="/home/openclaw/.nvm/versions/node/v22.18.0/bin/node"
fi
if [ ! -x "$NODE_BIN" ]; then
    echo "ERROR: No usable node binary found" >&2
    exit 1
fi

# Spawn fully detached via systemd-run --scope (creates a transient unit that
# the EXEC tool's session has no handle on). The process becomes its own
# service that survives any shell teardown.
cd "$PROJECT_DIR"
systemd-run --unit=seravavatar-frontend --scope --quiet \
    "$NODE_BIN" \
    node_modules/.bin/next start -p "$PORT" \
    > "$LOG" 2>&1 < /dev/null &

sleep 6

# Verify by checking if port is bound
if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
    FUSER_PID=$(sudo fuser "$PORT/tcp" 2>/dev/null | tr -d ' ')
    if [ -n "$FUSER_PID" ]; then
        echo "Started next-server PID=$FUSER_PID on port $PORT"
        echo "Log: $LOG"
    else
        echo "WARNING: Port $PORT bound but PID not found"
        echo "Log: $LOG"
    fi
else
    echo "ERROR: next-server failed to bind port $PORT" >&2
    tail -10 "$LOG" >&2
    exit 1
fi
