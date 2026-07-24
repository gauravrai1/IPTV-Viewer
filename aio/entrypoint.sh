#!/bin/sh
set -e

nginx -g 'daemon off;' &
NGINX_PID=$!

node /app/backend/src/server.js &
NODE_PID=$!

shutdown() {
  kill -TERM "$NGINX_PID" 2>/dev/null
  kill -TERM "$NODE_PID" 2>/dev/null
  wait "$NGINX_PID" 2>/dev/null
  wait "$NODE_PID" 2>/dev/null
  exit 0
}
trap shutdown TERM INT

# If either process dies, bring the container down so an orchestrator can restart it.
while true; do
  if ! kill -0 "$NGINX_PID" 2>/dev/null; then
    echo "nginx exited unexpectedly" >&2
    kill -TERM "$NODE_PID" 2>/dev/null
    wait "$NODE_PID" 2>/dev/null
    exit 1
  fi
  if ! kill -0 "$NODE_PID" 2>/dev/null; then
    echo "backend exited unexpectedly" >&2
    kill -TERM "$NGINX_PID" 2>/dev/null
    wait "$NGINX_PID" 2>/dev/null
    exit 1
  fi
  sleep 1
done
